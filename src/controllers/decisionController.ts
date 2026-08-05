import { Request, Response } from "express";
import { obtenerPool } from "../config/database.js";
import { createTaskForDecision } from "../services/kanbanBootstrap.js";

/* =========================
   CREATE DECISION
========================= */
export const createDecision = async (req: Request, res: Response) => {

    const client = await obtenerPool().connect();

    try {

        const {
            projectId,
            title,
            description,
            alternatives,
            closesAt,
            consequences,
            supersedesId
        } = req.body;

        const userId = (req as any).user.id;

        if (!projectId || !title || !description) {
            return res.status(400).json({
                error: "projectId, title y description son obligatorios"
            });
        }

        await client.query("BEGIN");

        /* =========================
           Verificar acceso al proyecto
        ========================= */

        const membership = await client.query(
            `
            SELECT p.id
            FROM proyectos p
            INNER JOIN miembros_proyecto mp
                ON p.id = mp.proyecto_id
            WHERE
                p.id = $1
            AND mp.usuario_id = $2
            `,
            [projectId, userId]
        );

        if (membership.rows.length === 0) {

            await client.query("ROLLBACK");

            return res.status(404).json({
                error: "Proyecto no encontrado o sin acceso"
            });
        }

        /* =========================
           Validar la decisión que se reemplaza (linaje).
           Debe existir y pertenecer al mismo proyecto.
        ========================= */

        let supersedes: number | null = null;

        if (
            supersedesId !== undefined &&
            supersedesId !== null &&
            supersedesId !== ""
        ) {
            const previous = await client.query(
                `SELECT id FROM decisiones WHERE id = $1 AND proyecto_id = $2`,
                [supersedesId, projectId]
            );

            if (previous.rows.length === 0) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    error: "La decisión que se intenta reemplazar no existe en este proyecto"
                });
            }

            supersedes = Number(supersedesId);
        }

        // Normalizamos la fecha de cierre (viene como string del input datetime-local).
        const closesAtValue =
            closesAt && !Number.isNaN(new Date(closesAt).getTime())
                ? new Date(closesAt)
                : null;

        const consequencesValue =
            typeof consequences === "string" && consequences.trim() !== ""
                ? consequences.trim()
                : null;

        /* =========================
           Crear decisión
        ========================= */

        const decisionResult = await client.query(
            `
            INSERT INTO decisiones
            (
                proyecto_id,
                usuario_proponente_id,
                titulo,
                descripcion,
                fecha_cierre,
                consecuencias,
                reemplaza_a
            )
            VALUES
            (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7
            )
            RETURNING *
            `,
            [
                projectId,
                userId,
                title,
                description,
                closesAtValue,
                consequencesValue,
                supersedes
            ]
        );

        const decision = decisionResult.rows[0];

        /* =========================
           Registrar alternativas
        ========================= */

        if (
            Array.isArray(alternatives) &&
            alternatives.length > 0
        ) {

            for (const alternative of alternatives) {

                await client.query(
                    `
                    INSERT INTO alternativas_decision
                    (
                        decision_id,
                        nombre
                    )
                    VALUES
                    (
                        $1,
                        $2
                    )
                    `,
                    [
                        decision.id,
                        alternative
                    ]
                );

            }

        }

        await client.query("COMMIT");

        // Crear automáticamente una tarea en el Kanban ("Pendiente") ligada a
        // esta decisión. Best-effort: la decisión ya quedó guardada aunque
        // esto falle, así que no rompemos la respuesta.
        try {
            await createTaskForDecision({
                projectId: Number(projectId),
                decisionId: decision.id,
                userId,
                title
            });
        } catch (kanbanError) {
            console.error(
                "No se pudo crear la tarea de Kanban para la decisión:",
                kanbanError
            );
        }

        return res.status(201).json({

            id: decision.id,

            projectId: decision.proyecto_id,

            title: decision.titulo,

            description: decision.descripcion,

            alternatives: alternatives ?? [],

            consequences: decision.consecuencias,

            closesAt: decision.fecha_cierre,

            supersedesId: decision.reemplaza_a,

            proposedBy: decision.usuario_proponente_id,

            createdAt: decision.fecha_creacion

        });

    } catch (error) {

        await client.query("ROLLBACK");

        return res.status(500).json({
            error: "Error al crear la decisión"
        });

    } finally {

        client.release();

    }

};

/* =========================
   GET DECISIONS
========================= */
export const getDecisions = async (req: Request, res: Response) => {

    try {

        const { projectId, q } = req.query;
        const userId = (req as any).user.id;

        if (!projectId) {
            return res.status(400).json({
                error: "projectId es obligatorio"
            });
        }

        const pool = obtenerPool();

        /* =========================
           Verificar acceso al proyecto
        ========================= */

        const membership = await pool.query(
            `
            SELECT p.id
            FROM proyectos p
            INNER JOIN miembros_proyecto mp
                ON p.id = mp.proyecto_id
            WHERE
                p.id = $1
            AND mp.usuario_id = $2
            `,
            [
                projectId,
                userId
            ]
        );

        if (membership.rows.length === 0) {
            return res.status(404).json({
                error: "Proyecto no encontrado o sin acceso"
            });
        }

        /* =========================
           Obtener decisiones
           Incluye alternativas, conteo de votos y búsqueda opcional (q).
        ========================= */

        const params: any[] = [projectId];
        let searchFilter = "";

        if (q && String(q).trim() !== "") {
            params.push(`%${String(q).trim()}%`);
            searchFilter = `
                AND (
                    d.titulo ILIKE $${params.length}
                    OR d.descripcion ILIKE $${params.length}
                    OR EXISTS (
                        SELECT 1 FROM alternativas_decision a2
                        WHERE a2.decision_id = d.id
                        AND a2.nombre ILIKE $${params.length}
                    )
                )
            `;
        }

        const result = await pool.query(
            `
            SELECT

                d.id,
                d.proyecto_id,
                d.usuario_proponente_id,
                d.titulo,
                d.descripcion,
                d.estado,
                d.fecha_creacion,
                d.fecha_cierre,
                d.consecuencias,

                -- Decisión que ESTA reemplaza (linaje hacia atrás).
                prev.id     AS supersedes_id,
                prev.titulo AS supersedes_title,

                -- Decisión más reciente que reemplaza a ESTA (linaje hacia adelante).
                (
                    SELECT json_build_object('id', n.id, 'title', n.titulo)
                    FROM decisiones n
                    WHERE n.reemplaza_a = d.id
                    ORDER BY n.fecha_creacion DESC
                    LIMIT 1
                ) AS superseded_by,

                COALESCE(
                    json_agg(DISTINCT ad.nombre)
                    FILTER (WHERE ad.id IS NOT NULL),
                    '[]'
                ) AS alternatives,

                COUNT(DISTINCT v.id) FILTER (WHERE v.voto = 'aprobar')::int  AS votes_approve,
                COUNT(DISTINCT v.id) FILTER (WHERE v.voto = 'rechazar')::int AS votes_reject

            FROM decisiones d

            LEFT JOIN alternativas_decision ad
                ON d.id = ad.decision_id

            LEFT JOIN votos v
                ON d.id = v.decision_id

            LEFT JOIN decisiones prev
                ON d.reemplaza_a = prev.id

            WHERE d.proyecto_id = $1
            ${searchFilter}

            GROUP BY
                d.id,
                d.proyecto_id,
                d.usuario_proponente_id,
                d.titulo,
                d.descripcion,
                d.estado,
                d.fecha_creacion,
                d.fecha_cierre,
                d.consecuencias,
                prev.id,
                prev.titulo

            ORDER BY d.fecha_creacion DESC
            `,
            params
        );

        const now = Date.now();

        const decisions = result.rows.map(decision => {

            const approve = decision.votes_approve;
            const reject = decision.votes_reject;

            // ¿La votación ya cerró? (solo si hay fecha de cierre y ya pasó)
            const votingClosed = Boolean(
                decision.fecha_cierre &&
                new Date(decision.fecha_cierre).getTime() < now
            );

            const supersededBy = decision.superseded_by || null;

            // El estado se deriva de los votos cuando aún está "pendiente".
            let status = decision.estado;
            if (status === "pendiente") {
                if (approve > reject) status = "aprobada";
                else if (reject > approve) status = "rechazada";
            }

            // Una decisión reemplazada por otra queda como obsoleta,
            // sin importar el resultado de su votación.
            if (supersededBy) {
                status = "obsoleta";
            }

            return {
                id: decision.id,
                projectId: decision.proyecto_id,
                title: decision.titulo,
                description: decision.descripcion,
                alternatives: decision.alternatives,
                consequences: decision.consecuencias,
                closesAt: decision.fecha_cierre,
                votingClosed,
                supersedes: decision.supersedes_id
                    ? { id: decision.supersedes_id, title: decision.supersedes_title }
                    : null,
                supersededBy,
                proposedBy: decision.usuario_proponente_id,
                status,
                votes: { approve, reject, total: approve + reject },
                createdAt: decision.fecha_creacion
            };
        });

        return res.json(decisions);

    } catch (error) {

        return res.status(500).json({
            error: "Error al obtener las decisiones"
        });

    }

};