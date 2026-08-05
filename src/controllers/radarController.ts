import { Request, Response } from "express";
import { obtenerPool } from "../config/database.js";
import { generateRadar } from "../services/radarService.js";

/* =========================
   GET RADAR
   GET /projects/:id/radar
   Radar de riesgos: contradicciones, obsolescencia y huecos de conocimiento.
========================= */
export const getRadar = async (req: Request, res: Response) => {
    try {
        const projectId = Number(req.params.id);
        const userId = (req as any).user.id;

        if (!Number.isInteger(projectId)) {
            return res.status(400).json({ error: "El ID del proyecto no es válido" });
        }

        const pool = obtenerPool();

        const membership = await pool.query(
            `SELECT rol FROM miembros_proyecto WHERE proyecto_id = $1 AND usuario_id = $2`,
            [projectId, userId]
        );

        if (membership.rows.length === 0) {
            return res.status(404).json({ error: "Proyecto no encontrado o sin acceso" });
        }

        const radar = await generateRadar(projectId);

        return res.json(radar);

    } catch (error) {
        console.error("Error al generar el radar:", error);
        return res.status(500).json({ error: "No fue posible generar el radar" });
    }
};
