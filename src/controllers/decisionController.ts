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

        const { projectId } = req.query;
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
        ========================= */

        const result = await pool.query(
            `
            SELECT

                d.id,

                d.proyecto_id,

                d.usuario_proponente_id,

                d.titulo,

                d.descripcion,

                d.fecha_creacion,

                COALESCE(

                    json_agg(ad.nombre)
                    FILTER (WHERE ad.id IS NOT NULL),

                    '[]'

                ) AS alternatives

            FROM decisiones d

            LEFT JOIN alternativas_decision ad

                ON d.id = ad.decision_id

            WHERE d.proyecto_id = $1

            GROUP BY

                d.id,
                d.proyecto_id,
                d.usuario_proponente_id,
                d.titulo,
                d.descripcion,
                d.fecha_creacion

            ORDER BY d.fecha_creacion DESC
            `,
            [projectId]
        );

        const decisions = result.rows.map(decision => ({

            id: decision.id,

            projectId: decision.proyecto_id,

            title: decision.titulo,

            description: decision.descripcion,

            alternatives: decision.alternatives,

            proposedBy: decision.usuario_proponente_id,

            createdAt: decision.fecha_creacion

        }));

        return res.json(decisions);

    } catch (error) {

        return res.status(500).json({
            error: "Error al obtener las decisiones"
        });

    }

};