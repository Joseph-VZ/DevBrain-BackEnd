import { Request, Response } from "express";
import { obtenerPool } from "../config/database.js";

const voteMap: Record<string, string> = {
    approve: "aprobar",
    reject: "rechazar"
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
            SELECT id
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