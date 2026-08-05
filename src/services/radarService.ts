import { GoogleGenerativeAI } from "@google/generative-ai";
import { obtenerPool } from "../config/database.js";

/*
 radarService
 Radar de riesgos de decisiones: detecta contradicciones entre decisiones
 vigentes, decisiones que parecen obsoletas y huecos de conocimiento.
 Combina señales deterministas (rápidas, siempre presentes) con un análisis
 de IA (Gemini) que "razona" sobre el conjunto de decisiones.
*/

type Severity = "alta" | "media" | "baja";
type SignalType = "contradiccion" | "obsolescencia" | "estancada" | "hueco";

interface RadarSignal {
    type: SignalType;
    severity: Severity;
    title: string;
    detail: string;
    recommendation: string;
    decisions: { id: number; title: string }[];
    source: "ia" | "auto";
}

const SEVERITY_WEIGHT: Record<Severity, number> = { alta: 3, media: 2, baja: 1 };

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export async function generateRadar(projectId: number) {
    const pool = obtenerPool();

    const result = await pool.query(
        `
        SELECT
            d.id,
            d.titulo,
            d.descripcion,
            d.estado,
            d.fecha_creacion,
            d.fecha_cierre,
            d.consecuencias,

            prev.id     AS reemplaza_id,
            prev.titulo AS reemplaza_titulo,

            (
                SELECT n.id FROM decisiones n
                WHERE n.reemplaza_a = d.id
                ORDER BY n.fecha_creacion DESC LIMIT 1
            ) AS reemplazada_por_id,

            COUNT(DISTINCT v.id) FILTER (WHERE v.voto = 'aprobar')::int  AS a_favor,
            COUNT(DISTINCT v.id) FILTER (WHERE v.voto = 'rechazar')::int AS en_contra,

            COALESCE(
                json_agg(DISTINCT ad.nombre) FILTER (WHERE ad.id IS NOT NULL),
                '[]'
            ) AS alternativas

        FROM decisiones d
        LEFT JOIN decisiones prev ON d.reemplaza_a = prev.id
        LEFT JOIN votos v ON d.id = v.decision_id
        LEFT JOIN alternativas_decision ad ON d.id = ad.decision_id
        WHERE d.proyecto_id = $1
        GROUP BY d.id, prev.id, prev.titulo
        ORDER BY d.fecha_creacion DESC
        `,
        [projectId]
    );

    const now = Date.now();

    const decisions = result.rows.map((d) => {
        const approve = d.a_favor as number;
        const reject = d.en_contra as number;
        const isObsolete = Boolean(d.reemplazada_por_id);

        let status: string = d.estado;
        if (status === "pendiente") {
            if (approve > reject) status = "aprobada";
            else if (reject > approve) status = "rechazada";
        }
        if (isObsolete) status = "obsoleta";

        const created = d.fecha_creacion ? new Date(d.fecha_creacion) : null;
        const ageDays = created ? (now - created.getTime()) / MS_PER_DAY : 0;
        const votingClosed = Boolean(
            d.fecha_cierre && new Date(d.fecha_cierre).getTime() < now
        );

        return {
            id: d.id as number,
            title: d.titulo as string,
            description: (d.descripcion as string) || "",
            rawStatus: d.estado as string,
            status,
            isObsolete,
            consequences: (d.consecuencias as string) || "",
            alternatives: Array.isArray(d.alternativas) ? d.alternativas : [],
            approve,
            reject,
            ageDays,
            votingClosed
        };
    });

    const signals: RadarSignal[] = [];

    // ── Señales deterministas ──
    for (const dec of decisions) {
        if (dec.isObsolete) continue;

        // Decisión vieja sin revisión.
        if (dec.ageDays >= 180) {
            const months = Math.round(dec.ageDays / 30);
            signals.push({
                type: "obsolescencia",
                severity: dec.ageDays >= 365 ? "alta" : "media",
                title: "Decisión sin revisar",
                detail: `"${dec.title}" tiene ~${months} meses y no se ha revisado ni reemplazado. Puede estar desactualizada.`,
                recommendation: "Revísala: confirma que sigue vigente o regístrala como reemplazada.",
                decisions: [{ id: dec.id, title: dec.title }],
                source: "auto"
            });
        }

        // Votación cerrada sin resolución clara.
        if (dec.votingClosed && dec.rawStatus === "pendiente" && dec.approve === dec.reject) {
            signals.push({
                type: "estancada",
                severity: "media",
                title: "Votación cerrada sin resolución",
                detail:
                    dec.approve + dec.reject === 0
                        ? `La votación de "${dec.title}" cerró sin ningún voto.`
                        : `La votación de "${dec.title}" cerró en empate (${dec.approve}-${dec.reject}).`,
                recommendation: "Reabre la discusión o toma una decisión final y regístrala.",
                decisions: [{ id: dec.id, title: dec.title }],
                source: "auto"
            });
        }

        // Pendiente estancada sin votos.
        if (dec.rawStatus === "pendiente" && !dec.votingClosed && dec.ageDays >= 21 && dec.approve + dec.reject === 0) {
            signals.push({
                type: "estancada",
                severity: "media",
                title: "Decisión pendiente estancada",
                detail: `"${dec.title}" lleva ${Math.round(dec.ageDays)} días pendiente y sin votos del equipo.`,
                recommendation: "Impulsa la votación o ciérrala; una decisión sin avanzar bloquea al equipo.",
                decisions: [{ id: dec.id, title: dec.title }],
                source: "auto"
            });
        }

        // Hueco de conocimiento: aprobada sin consecuencias.
        if (dec.status === "aprobada" && !dec.consequences.trim()) {
            signals.push({
                type: "hueco",
                severity: "baja",
                title: "Falta documentar consecuencias",
                detail: `"${dec.title}" está aprobada pero no documenta sus consecuencias / trade-offs.`,
                recommendation: "Agrega qué se sacrifica con esta decisión: es lo más valioso a futuro.",
                decisions: [{ id: dec.id, title: dec.title }],
                source: "auto"
            });
        }
    }

    // ── Señales de IA (contradicciones / obsolescencia por contenido) ──
    const vigentes = decisions.filter((d) => !d.isObsolete);

    if (vigentes.length >= 2 && process.env.GEMINI_API_KEY) {
        try {
            const aiSignals = await analyzeWithAI(vigentes);
            signals.push(...aiSignals);
        } catch (error) {
            console.error("Radar IA falló, se usan solo señales automáticas:", error);
        }
    }

    signals.sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]);

    const byType = signals.reduce<Record<string, number>>((acc, s) => {
        acc[s.type] = (acc[s.type] || 0) + 1;
        return acc;
    }, {});

    const bySeverity = signals.reduce<Record<string, number>>((acc, s) => {
        acc[s.severity] = (acc[s.severity] || 0) + 1;
        return acc;
    }, {});

    return {
        generatedAt: new Date().toISOString(),
        totalDecisions: decisions.length,
        analyzedDecisions: vigentes.length,
        signals,
        summary: {
            total: signals.length,
            byType,
            bySeverity
        }
    };
}

async function analyzeWithAI(
    vigentes: {
        id: number;
        title: string;
        description: string;
        status: string;
        alternatives: string[];
        consequences: string;
    }[]
): Promise<RadarSignal[]> {
    const byId = new Map(vigentes.map((d) => [d.id, d]));

    const context = vigentes
        .map((d) => {
            const alts = d.alternatives.length ? d.alternatives.join(", ") : "ninguna";
            const cons = d.consequences.trim() || "no documentadas";
            return `Decisión #${d.id} | Estado: ${d.status}
Título: ${d.title}
Descripción: ${d.description}
Alternativas: ${alts}
Consecuencias: ${cons}`;
        })
        .join("\n---\n");

    const prompt = `
Eres un auditor técnico de DevBrain. Analiza SOLO las decisiones vigentes de un proyecto de software y detecta problemas reales. Sé conservador: si no hay evidencia clara, no inventes señales.

Busca dos cosas:
1) CONTRADICCIONES: dos o más decisiones vigentes que no pueden coexistir (p. ej. una elige PostgreSQL y otra MongoDB para lo mismo; una prohíbe X y otra lo usa).
2) OBSOLESCENCIA: una decisión que otra decisión más reciente vuelve desactualizada o incoherente, aunque no esté marcada formalmente como reemplazada.

Devuelve ÚNICAMENTE JSON válido con esta forma:
{
  "signals": [
    {
      "type": "contradiccion" | "obsolescencia",
      "severity": "alta" | "media" | "baja",
      "title": "título corto",
      "detail": "explicación clara en español, mencionando los títulos de las decisiones",
      "recommendation": "qué hacer para resolverlo",
      "decisionIds": [numeros de las decisiones involucradas]
    }
  ]
}
Si no encuentras nada, devuelve {"signals": []}.

Decisiones vigentes:
${context}
`;

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({
        model: "models/gemini-2.5-flash",
        generationConfig: { responseMimeType: "application/json" }
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    let parsed: any;
    try {
        parsed = JSON.parse(text);
    } catch {
        // Por si el modelo envolvió el JSON en texto.
        const match = text.match(/\{[\s\S]*\}/);
        parsed = match ? JSON.parse(match[0]) : { signals: [] };
    }

    const raw = Array.isArray(parsed?.signals) ? parsed.signals : [];

    const allowedSeverity: Severity[] = ["alta", "media", "baja"];

    return raw
        .map((s: any): RadarSignal | null => {
            const type: SignalType =
                s.type === "contradiccion" ? "contradiccion" : "obsolescencia";
            const severity: Severity = allowedSeverity.includes(s.severity)
                ? s.severity
                : "media";

            const ids: number[] = Array.isArray(s.decisionIds)
                ? s.decisionIds.map((n: any) => Number(n)).filter((n: number) => byId.has(n))
                : [];

            const involved = ids.map((id) => ({ id, title: byId.get(id)!.title }));

            if (!s.title || !s.detail) return null;

            return {
                type,
                severity,
                title: String(s.title),
                detail: String(s.detail),
                recommendation: String(s.recommendation || ""),
                decisions: involved,
                source: "ia"
            };
        })
        .filter(Boolean) as RadarSignal[];
}
