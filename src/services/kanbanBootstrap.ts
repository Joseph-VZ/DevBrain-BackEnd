import { obtenerPool } from "../config/database.js";

/*
 kanbanBootstrap
 Utilidades para mantener el tablero Kanban en sincronía con el proyecto:
 - Sembrar las columnas por defecto (para proyectos nuevos).
 - Crear automáticamente una tarea en "Pendiente" cuando se registra una
   decisión, ligada a esa decisión.
*/

const DEFAULT_COLUMNS = [
    { nombre: "Pendiente", posicion: 1, color: "#7B7BFF" },
    { nombre: "En progreso", posicion: 2, color: "#FACC15" },
    { nombre: "En revisión", posicion: 3, color: "#38BDF8" },
    { nombre: "Completado", posicion: 4, color: "#2FE6C8" }
];

// Crea las columnas por defecto del proyecto si aún no existen (idempotente).
export async function ensureDefaultColumns(projectId: number): Promise<void> {
    const pool = obtenerPool();

    for (const column of DEFAULT_COLUMNS) {
        await pool.query(
            `
            INSERT INTO columnas_kanban (proyecto_id, nombre, posicion, color)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (proyecto_id, nombre) DO NOTHING
            `,
            [projectId, column.nombre, column.posicion, column.color]
        );
    }
}

// Crea una tarea en la columna "Pendiente" ligada a la decisión.
export async function createTaskForDecision(params: {
    projectId: number;
    decisionId: number;
    userId: number;
    title: string;
}): Promise<void> {
    const { projectId, decisionId, userId, title } = params;
    const pool = obtenerPool();

    // Garantiza que el proyecto tenga tablero antes de crear la tarea.
    await ensureDefaultColumns(projectId);

    // Preferimos la columna "Pendiente"; si no, la primera por posición.
    const columnResult = await pool.query(
        `
        SELECT id
        FROM columnas_kanban
        WHERE proyecto_id = $1
        ORDER BY (nombre = 'Pendiente') DESC, posicion ASC, id ASC
        LIMIT 1
        `,
        [projectId]
    );

    if (columnResult.rows.length === 0) return;

    const columnId = columnResult.rows[0].id;

    const positionResult = await pool.query(
        `
        SELECT COALESCE(MAX(posicion), 0) + 1 AS siguiente
        FROM tareas_kanban
        WHERE columna_id = $1
        `,
        [columnId]
    );

    const position = Number(positionResult.rows[0].siguiente);

    await pool.query(
        `
        INSERT INTO tareas_kanban
        (
            proyecto_id,
            columna_id,
            creador_id,
            titulo,
            prioridad,
            posicion,
            decision_id
        )
        VALUES ($1, $2, $3, $4, 'media', $5, $6)
        `,
        [projectId, columnId, userId, title.trim(), position, decisionId]
    );
}
