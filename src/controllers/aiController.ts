import { Request, Response } from "express";
import { queryAI } from "../services/aiService.js";

export const aiQuery = async (req: Request, res: Response) => {

    try {

        const { projectId, question } = req.body;

        const userId = (req as any).user.id;

        if (!projectId || !question) {
            return res.status(400).json({
                error: "projectId y question son obligatorios"
            });
        }

        const result = await queryAI(
            projectId,
            question,
            userId
        );

        return res.json(result);

    } catch (error) {

        if (error instanceof Error) {
            return res.status(400).json({
                error: error.message
            });
        }

        return res.status(500).json({
            error: "Error interno del servidor"
        });

    }
};