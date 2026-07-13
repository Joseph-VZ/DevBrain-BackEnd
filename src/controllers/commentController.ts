import { Request, Response } from "express";
import { obtenerPool } from "../config/database.js";

/* Verifica que el usuario sea miembro del proyecto dueño de la decisión. */
async function canAccessDecision(decisionId: any, userId: any): Promise<boolean> {
    const pool = obtenerPool();
    const result = await pool.query(
        `
        SELECT d.id
        FROM decisiones d
        INNER JOIN miembros_proyecto mp
            ON mp.proyecto_id = d.proyecto_id
        WHERE d.id = $1 AND mp.usuario_id = $2
        `,
        [decisionId, userId]
    );
    return result.rows.length > 0;
}

/* =========================
   LIST COMMENTS
   GET /decisions/:id/comments
========================= */
export const listComments = async (req: Request, res: Response) => {

    try {
        const decisionId = req.params.id;
        const userId = (req as any).user.id;

        if (!(await canAccessDecision(decisionId, userId))) {
            return res.status(404).json({ error: "Decisión no encontrada o sin acceso" });
        }

        const pool = obtenerPool();

        const result = await pool.query(
            `
            SELECT
                c.id,
                c.contenido,
                c.fecha_creacion,
                u.id AS usuario_id,
                u.nombre AS usuario_nombre
            FROM comentarios_decision c
            INNER JOIN usuarios u ON u.id = c.usuario_id
            WHERE c.decision_id = $1
            ORDER BY c.fecha_creacion ASC
            `,
            [decisionId]
        );

        const comments = result.rows.map(row => ({
            id: row.id,
            content: row.contenido,
            createdAt: row.fecha_creacion,
            author: { id: row.usuario_id, name: row.usuario_nombre }
        }));

        return res.json(comments);

    } catch (error) {
        return res.status(500).json({ error: "Error al obtener los comentarios" });
    }
};

/* =========================
   CREATE COMMENT
   POST /decisions/:id/comments   body: { content }
========================= */
export const createComment = async (req: Request, res: Response) => {

    try {
        const decisionId = req.params.id;
        const userId = (req as any).user.id;
        const { content } = req.body;

        if (!content || !String(content).trim()) {
            return res.status(400).json({ error: "El comentario no puede estar vacío" });
        }

        if (!(await canAccessDecision(decisionId, userId))) {
            return res.status(404).json({ error: "Decisión no encontrada o sin acceso" });
        }

        const pool = obtenerPool();

        const inserted = await pool.query(
            `
            INSERT INTO comentarios_decision (decision_id, usuario_id, contenido)
            VALUES ($1, $2, $3)
            RETURNING id, contenido, fecha_creacion
            `,
            [decisionId, userId, String(content).trim()]
        );

        const user = await pool.query(
            `SELECT nombre FROM usuarios WHERE id = $1`,
            [userId]
        );

        const row = inserted.rows[0];

        return res.status(201).json({
            id: row.id,
            content: row.contenido,
            createdAt: row.fecha_creacion,
            author: { id: userId, name: user.rows[0]?.nombre }
        });

    } catch (error) {
        return res.status(500).json({ error: "Error al crear el comentario" });
    }
};
