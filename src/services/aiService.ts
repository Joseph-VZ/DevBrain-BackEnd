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
                d.id,
                d.titulo,
                d.descripcion,
                d.estado,
                d.fecha_creacion,
                COALESCE(
                    json_agg(DISTINCT ad.nombre)
                    FILTER (WHERE ad.id IS NOT NULL),
                    '[]'
                ) AS alternativas,
                COUNT(DISTINCT v.id) FILTER (WHERE v.voto = 'aprobar')::int  AS a_favor,
                COUNT(DISTINCT v.id) FILTER (WHERE v.voto = 'rechazar')::int AS en_contra
            FROM decisiones d
            LEFT JOIN alternativas_decision ad ON d.id = ad.decision_id
            LEFT JOIN votos v ON d.id = v.decision_id
            WHERE d.proyecto_id = $1
            GROUP BY d.id, d.titulo, d.descripcion, d.estado, d.fecha_creacion
            ORDER BY d.fecha_creacion DESC
        `,
            [projectId]
        );
        // Obtener las últimas conversaciones del proyecto
        const conversations = await pool.query(
            `
            SELECT
                pregunta,
                respuesta
            FROM ai_conversations
            WHERE proyecto_id = $1
            ORDER BY fecha_creacion DESC
            LIMIT 10
            `,
            [projectId]
        );

        if (decisions.rows.length === 0) {
            return {
                answer:
                    "Este proyecto todavía no tiene decisiones registradas, " +
                    "así que aún no hay memoria que consultar. Crea la primera decisión para empezar.",
                sources: []
            };
        }

        const context = decisions.rows
            .map((d) => {
                const fecha = d.fecha_creacion
                    ? new Date(d.fecha_creacion).toISOString().slice(0, 10)
                    : "sin fecha";
                const alts = Array.isArray(d.alternativas) && d.alternativas.length
                    ? d.alternativas.join(", ")
                    : "ninguna";
                return `Decisión #${d.id} (${fecha}) — estado: ${d.estado}
Título: ${d.titulo}
Descripción: ${d.descripcion}
Alternativas evaluadas: ${alts}
Votos: ${d.a_favor} a favor, ${d.en_contra} en contra`;
            })
            .join("\n\n---\n\n");
            const conversationContext = conversations.rows
    .reverse()
    .map((c) => {
        return `Usuario: ${c.pregunta}

IA: ${c.respuesta}`;
    })
    .join("\n\n------------------------\n\n");

        const prompt = `
Eres el asistente de memoria técnica de DevBrain. Conoces el historial de decisiones de un proyecto de software y ayudas al equipo a recordar QUÉ se decidió y POR QUÉ.

Reglas:
- Responde ÚNICAMENTE con la información del contexto.
- Prioriza siempre el historial de decisiones.
- Si el historial de conversación aporta información útil, úsalo para mantener continuidad.
- Cuando menciones una decisión, cítala con su número, por ejemplo: "(decisión #12)".
- Si la respuesta no está en el contexto, indícalo claramente.
- Sé conciso y responde en español.

Contexto de decisiones del proyecto:
${context}

Historial reciente de conversación:
${conversationContext || "No existen conversaciones previas."}

Nueva pregunta del usuario:
${question}
`;

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

        const model = genAI.getGenerativeModel({
            model: "models/gemini-2.5-flash"
        });
        const result = await model.generateContent(prompt);

        const response = result.response;

        const answer = response.text();
        await pool.query(
    `
    INSERT INTO ai_conversations
    (
        proyecto_id,
        usuario_id,
        pregunta,
        respuesta
    )
    VALUES
    (
        $1,
        $2,
        $3,
        $4
    )
    `,
    [
        projectId,
        userId,
        question,
        answer
    ]
);

        // Fuentes citables: las decisiones cuyo #id aparece en la respuesta.
        const sources = decisions.rows
            .filter((d) => answer.includes(`#${d.id}`))
            .map((d) => ({ id: d.id, title: d.titulo, status: d.estado }));

        return {
            answer,
            sources
        };

    } catch (error) {

        if (error instanceof Error) {
            throw error;
        }

        throw new Error("Error al obtener respuesta de Gemini");

    }



};

