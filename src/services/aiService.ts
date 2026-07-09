import { GoogleGenerativeAI } from "@google/generative-ai";
import { obtenerPool } from "../config/database.js";


export const queryAI = async (
    projectId: number,
    question: string,
    userId: number
) => {

    try {
        const pool = obtenerPool();
        console.log("USER ID:", userId);
        console.log("PROJECT ID:", projectId);
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
            throw new Error("Proyecto no encontrado o sin acceso");
        }
        const decisions = await pool.query(
            `
            SELECT
                titulo,
                descripcion
            FROM decisiones
            WHERE proyecto_id = $1
            ORDER BY fecha_creacion DESC
        `,
            [projectId]
        );
        const context = decisions.rows
            .map(
                (decision) =>
                    `Título: ${decision.titulo}
    Descripción: ${decision.descripcion}`
            )
            .join("\n\n");
        const prompt = `
    Eres un asistente de DevBrain.

    Responde la pregunta del usuario utilizando únicamente la información proporcionada en las decisiones del proyecto.

    Si la respuesta no se encuentra en el contexto, indícalo claramente.

    Contexto:
    ${context}

    Pregunta:
    ${question}
    `;

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

        const model = genAI.getGenerativeModel({
            model: "models/gemini-2.5-flash"
        });
        const result = await model.generateContent(prompt);

        const response = result.response;

        const answer = response.text();
        return {
            answer
        };

    } catch (error) {

        if (error instanceof Error) {
            throw error;
        }

        throw new Error("Error al obtener respuesta de Gemini");

    }



};

