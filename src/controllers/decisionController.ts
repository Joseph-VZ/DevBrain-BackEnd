import { Request, Response } from "express";
import { obtenerPool } from "../config/database.js";

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
            alternatives
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
           Crear decisión
        ========================= */

        const decisionResult = await client.query(
            `
            INSERT INTO decisiones
            (
                proyecto_id,
                usuario_proponente_id,
                titulo,
                descripcion
            )
            VALUES
            (
                $1,
                $2,
                $3,
                $4
            )
            RETURNING *
            `,
            [
                projectId,
                userId,
                title,
                description
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

        return res.status(201).json({

            id: decision.id,

            projectId: decision.proyecto_id,

            title: decision.titulo,

            description: decision.descripcion,

            alternatives: alternatives ?? [],

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

            WHERE d.proyecto_id = $1
            ${searchFilter}

            GROUP BY
                d.id,
                d.proyecto_id,
                d.usuario_proponente_id,
                d.titulo,
                d.descripcion,
                d.estado,
                d.fecha_creacion

            ORDER BY d.fecha_creacion DESC
            `,
            params
        );

        const decisions = result.rows.map(decision => {

            const approve = decision.votes_approve;
            const reject = decision.votes_reject;

            // El estado se deriva de los votos cuando aún está "pendiente".
            let status = decision.estado;
            if (status === "pendiente") {
                if (approve > reject) status = "aprobada";
                else if (reject > approve) status = "rechazada";
            }

            return {
                id: decision.id,
                projectId: decision.proyecto_id,
                title: decision.titulo,
                description: decision.descripcion,
                alternatives: decision.alternatives,
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