import { Request, Response } from "express";
import { obtenerPool } from "../config/database.js";

export const getProjectStats = async (
    req: Request,
    res: Response
) => {

    try {

        const { id } = req.params;
        const userId = (req as any).user.id;

        if (!id) {
            return res.status(400).json({
                error: "Id del proyecto requerido"
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
                id,
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

        const decisionsResult = await pool.query(
            `
            SELECT
                d.id,

                COUNT(v.id)
                FILTER (WHERE v.voto = 'aprobar')::int AS approve,

                COUNT(v.id)
                FILTER (WHERE v.voto = 'rechazar')::int AS reject

            FROM decisiones d

            LEFT JOIN votos v
                ON d.id = v.decision_id

            WHERE d.proyecto_id = $1

            GROUP BY d.id
            `,
            [id]
        );

        let aprobadas = 0;
        let rechazadas = 0;
        let pendientes = 0;

        for (const decision of decisionsResult.rows) {

            if (decision.approve > decision.reject) {

                aprobadas++;

            } else if (decision.reject > decision.approve) {

                rechazadas++;

            } else {

                pendientes++;

            }

        }

        /* =========================
           Total de votos
        ========================= */

        const votesResult = await pool.query(
            `
            SELECT COUNT(*)::int AS total

            FROM votos v

            INNER JOIN decisiones d
                ON v.decision_id = d.id

            WHERE d.proyecto_id = $1
            `,
            [id]
        );

        /* =========================
           Total de miembros
        ========================= */

        const membersResult = await pool.query(
            `
            SELECT COUNT(*)::int AS total

            FROM miembros_proyecto

            WHERE proyecto_id = $1
            `,
            [id]
        );

        return res.json({

            totalDecisiones: decisionsResult.rows.length,

            aprobadas,

            rechazadas,

            pendientes,

            totalVotos: votesResult.rows[0].total,

            totalMiembros: membersResult.rows[0].total

        });

    } catch (error) {

        return res.status(500).json({
            error: "Error al obtener estadísticas"
        });

    }

};