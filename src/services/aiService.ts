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
                d.fecha_cierre,
                d.consecuencias,

                u.nombre AS usuario_proponente,

                prev.id     AS reemplaza_id,
                prev.titulo AS reemplaza_titulo,

                (
                    SELECT json_build_object('id', n.id, 'title', n.titulo)
                    FROM decisiones n
                    WHERE n.reemplaza_a = d.id
                    ORDER BY n.fecha_creacion DESC
                    LIMIT 1
                ) AS reemplazada_por,

                COALESCE(
                    json_agg(DISTINCT ad.nombre)
                    FILTER (WHERE ad.id IS NOT NULL),
                    '[]'
                ) AS alternativas,

                COUNT(DISTINCT v.id) FILTER (WHERE v.voto = 'aprobar')::int AS a_favor,

                COUNT(DISTINCT v.id) FILTER (WHERE v.voto = 'rechazar')::int AS en_contra

            FROM decisiones d

            LEFT JOIN usuarios u
                ON d.usuario_proponente_id = u.id

            LEFT JOIN alternativas_decision ad
                ON d.id = ad.decision_id

            LEFT JOIN votos v
                ON d.id = v.decision_id

            LEFT JOIN decisiones prev
                ON d.reemplaza_a = prev.id

            WHERE d.proyecto_id = $1

            GROUP BY
                d.id,
                d.titulo,
                d.descripcion,
                d.estado,
                d.fecha_creacion,
                d.fecha_cierre,
                d.consecuencias,
                u.nombre,
                prev.id,
                prev.titulo

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

                const consecuencias = d.consecuencias
                    ? d.consecuencias
                    : "no documentadas";

                // Estado real considerando el linaje: si otra decisión la reemplazó,
                // esta ya es obsoleta (dejó de ser vigente).
                const reemplazadaPor = d.reemplazada_por;
                const estadoReal = reemplazadaPor
                    ? `OBSOLETA — fue reemplazada por "${reemplazadaPor.title}" (Decisión #${reemplazadaPor.id})`
                    : d.estado;

                const linaje = d.reemplaza_id
                    ? `Reemplaza a "${d.reemplaza_titulo}" (Decisión #${d.reemplaza_id})`
                    : "no reemplaza a ninguna decisión anterior";

                const cierre = d.fecha_cierre
                    ? `${new Date(d.fecha_cierre).toISOString().slice(0, 10)}` +
                      `${new Date(d.fecha_cierre).getTime() < Date.now() ? " (votación cerrada)" : " (votación abierta)"}`
                    : "sin fecha límite";

                return `
                    Título de la decisión:
                    ${d.titulo}

                    Descripción:
                    ${d.descripcion}

                    Propuesto por:
                    ${d.usuario_proponente || "Usuario desconocido"}

                    Alternativas evaluadas:
                    ${alts}

                    Consecuencias / trade-offs aceptados:
                    ${consecuencias}

                    Estado / vigencia:
                    ${estadoReal}

                    Linaje:
                    ${linaje}

                    Fecha de creación:
                    ${fecha}

                    Cierre de votación:
                    ${cierre}

                    Referencia interna:
                    Decisión #${d.id}

                    Votos:
                    ${d.a_favor} a favor, ${d.en_contra} en contra
                    `;
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
- Cuando menciones una decisión, usa primero su título y después agrega su número de referencia.
- Nunca respondas únicamente con un ID.
- Cuando el usuario pregunte por una decisión, incluye título, descripción, alternativas evaluadas, estado y fecha si están disponibles.
- Presta especial atención a la VIGENCIA: si una decisión está marcada como OBSOLETA (fue reemplazada por otra), acláralo y remite a la decisión vigente que la reemplazó. Nunca presentes una decisión obsoleta como si siguiera vigente.
- Cuando expliques el PORQUÉ de una decisión, menciona sus consecuencias / trade-offs aceptados si están documentados; si dicen "no documentadas", indícalo como un hueco de conocimiento.
- Si te preguntan qué votar o qué falta por decidir, apóyate en el estado y en si la votación está abierta o cerrada.
- Al final, cuando sea útil, sugiere 1 o 2 preguntas de seguimiento relevantes en una línea que empiece con "También podrías preguntar:".
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

