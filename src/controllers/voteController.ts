import { Request, Response } from "express";
import { obtenerPool } from "../config/database.js";

const voteMap: Record<string, string> = {
    approve: "aprobar",
    reject: "rechazar"
};

// Mapeo inverso: DB (español) -> API (inglés)
const reverseVoteMap: Record<string, string> = {
    aprobar: "approve",
    rechazar: "reject"
};

/* =========================
   GET VOTES
   Devuelve el conteo de votos de una decisión y el voto del usuario actual.
========================= */
export const getVotes = async (req: Request, res: Response) => {

    try {

        const { decisionId } = req.query;
        const userId = (req as any).user.id;

        if (!decisionId) {
            return res.status(400).json({
                error: "decisionId es obligatorio"
            });
        }

        const pool = obtenerPool();

        const decision = await pool.query(
            `SELECT id FROM decisiones WHERE id = $1`,
            [decisionId]
        );

        if (decision.rows.length === 0) {
            return res.status(404).json({
                error: "La decisión no existe"
            });
        }

        const countResult = await pool.query(
            `
            SELECT voto, COUNT(*)::int AS total
            FROM votos
            WHERE decision_id = $1
            GROUP BY voto
            `,
            [decisionId]
        );

        const counts: Record<string, number> = { approve: 0, reject: 0 };

        for (const row of countResult.rows) {
            const apiVote = reverseVoteMap[row.voto];
            if (apiVote) {
                counts[apiVote] = row.total;
            }
        }

        const myVoteResult = await pool.query(
            `
            SELECT voto
            FROM votos
            WHERE decision_id = $1 AND usuario_id = $2
            `,
            [decisionId, userId]
        );

        const myVote = myVoteResult.rows.length > 0
            ? reverseVoteMap[myVoteResult.rows[0].voto] ?? null
            : null;

        return res.json({
            decisionId: Number(decisionId),
            approve: counts.approve,
            reject: counts.reject,
            total: counts.approve + counts.reject,
            myVote
        });

    } catch (error) {
        return res.status(500).json({
            error: "Error al obtener los votos"
        });
    }
};

export const postVote = async (req: Request, res: Response) => {

    const client = await obtenerPool().connect();

    try {

        const { decisionId, vote } = req.body;
        const userId = (req as any).user.id;

        if (!decisionId || !vote) {
            return res.status(400).json({
                error: "decisionId y vote son requeridos"
            });
        }

        if (!voteMap[vote]) {
            return res.status(400).json({
                error: "Voto inválido"
            });
        }

        const mappedVote = voteMap[vote];

        await client.query("BEGIN");

        /* =========================
           Verificar decisión
        ========================= */

        const decision = await client.query(
            `
            SELECT id, fecha_cierre
            FROM decisiones
            WHERE id = $1
            `,
            [decisionId]
        );

        if (decision.rows.length === 0) {

            await client.query("ROLLBACK");

            return res.status(404).json({
                error: "La decisión no existe"
            });
        }

        /* =========================
           Verificar que la votación siga abierta
        ========================= */

        const closesAt = decision.rows[0].fecha_cierre;

        if (closesAt && new Date(closesAt).getTime() < Date.now()) {

            await client.query("ROLLBACK");

            return res.status(403).json({
                error: "La votación de esta decisión ya cerró"
            });
        }

        /* =========================
           Verificar voto duplicado
        ========================= */

        const existingVote = await client.query(
            `
            SELECT id
            FROM votos
            WHERE decision_id = $1
            AND usuario_id = $2
            `,
            [decisionId, userId]
        );

        if (existingVote.rows.length > 0) {

            await client.query("ROLLBACK");

            return res.status(409).json({
                error: "El usuario ya votó en esta decisión"
            });
        }

        /* =========================
           Insertar voto
        ========================= */

        const result = await client.query(
            `
            INSERT INTO votos
            (
                decision_id,
                usuario_id,
                voto,
                fecha_creacion
            )
            VALUES
            (
                $1,
                $2,
                $3,
                NOW()
            )
            RETURNING *
            `,
            [
                decisionId,
                userId,
                mappedVote
            ]
        );

        await client.query("COMMIT");

        const voteCreated = result.rows[0];

        return res.status(201).json({

            decisionId: voteCreated.decision_id,

            userId: voteCreated.usuario_id,

            vote

        });

    } catch (error) {

        await client.query("ROLLBACK");

        return res.status(500).json({
            error: "Error al registrar el voto"
        });

    } finally {

        client.release();

    }

};