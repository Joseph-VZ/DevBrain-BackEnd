import { Request, Response } from "express";
import { obtenerPool } from "../config/database.js";

/* =========================
   UTILIDAD: OBTENER ROL
========================= */
async function getProjectMemberRole(
    projectId: number,
    userId: number
): Promise<string | null> {
    const pool = obtenerPool();

    const result = await pool.query(
        `
        SELECT rol
        FROM miembros_proyecto
        WHERE proyecto_id = $1
          AND usuario_id = $2
        `,
        [projectId, userId]
    );

    return result.rows[0]?.rol || null;
}

/* =========================
   GET KANBAN
========================= */
export const getKanban = async (
    req: Request,
    res: Response
) => {
    try {
        const projectId = Number(req.params.projectId);
        const userId = (req as any).user.id;

        if (!Number.isInteger(projectId)) {
            return res.status(400).json({
                error: "El ID del proyecto no es válido"
            });
        }

        const role = await getProjectMemberRole(
            projectId,
            userId
        );

        if (!role) {
            return res.status(403).json({
                error: "No tienes acceso a este proyecto"
            });
        }

        const pool = obtenerPool();

        const columnsResult = await pool.query(
            `
            SELECT
                id,
                nombre,
                posicion,
                color,
                fecha_creacion
            FROM columnas_kanban
            WHERE proyecto_id = $1
            ORDER BY posicion ASC, id ASC
            `,
            [projectId]
        );

        const tasksResult = await pool.query(
            `
            SELECT
                tk.id,
                tk.proyecto_id,
                tk.columna_id,
                tk.creador_id,
                tk.responsable_id,
                tk.titulo,
                tk.descripcion,
                tk.prioridad,
                tk.posicion,
                tk.fecha_limite,
                tk.decision_id,
                tk.fecha_creacion,
                tk.fecha_actualizacion,
                u.nombre AS responsable_nombre,
                u.correo AS responsable_correo
            FROM tareas_kanban tk
            LEFT JOIN usuarios u
                ON u.id = tk.responsable_id
            WHERE tk.proyecto_id = $1
            ORDER BY
                tk.columna_id ASC,
                tk.posicion ASC,
                tk.id ASC
            `,
            [projectId]
        );

        const columns = columnsResult.rows.map((column) => ({
            id: column.id,
            name: column.nombre,
            position: column.posicion,
            color: column.color,
            createdAt: column.fecha_creacion,
            tasks: tasksResult.rows
                .filter((task) => task.columna_id === column.id)
                .map((task) => ({
                    id: task.id,
                    projectId: task.proyecto_id,
                    columnId: task.columna_id,
                    creatorId: task.creador_id,
                    assigneeId: task.responsable_id,
                    title: task.titulo,
                    description: task.descripcion,
                    priority: task.prioridad,
                    position: task.posicion,
                    dueDate: task.fecha_limite,
                    decisionId: task.decision_id,
                    createdAt: task.fecha_creacion,
                    updatedAt: task.fecha_actualizacion,
                    assignee: task.responsable_id
                        ? {
                            id: task.responsable_id,
                            name: task.responsable_nombre,
                            email: task.responsable_correo
                        }
                        : null
                }))
        }));

        return res.json({
            projectId,
            role,
            columns
        });

    } catch (error) {
        console.error("Error al obtener Kanban:", error);

        return res.status(500).json({
            error: "No fue posible obtener el tablero Kanban"
        });
    }
};

/* =========================
   CREATE COLUMN
========================= */
export const createKanbanColumn = async (
    req: Request,
    res: Response
) => {
    try {
        const projectId = Number(req.params.projectId);
        const userId = (req as any).user.id;
        const { name, color } = req.body;

        if (!Number.isInteger(projectId)) {
            return res.status(400).json({
                error: "El ID del proyecto no es válido"
            });
        }

        if (!name?.trim()) {
            return res.status(400).json({
                error: "El nombre de la columna es obligatorio"
            });
        }

        const role = await getProjectMemberRole(
            projectId,
            userId
        );

        if (role !== "administrador") {
            return res.status(403).json({
                error: "Solo un administrador puede crear columnas"
            });
        }

        const pool = obtenerPool();

        const positionResult = await pool.query(
            `
            SELECT COALESCE(MAX(posicion), 0) + 1 AS siguiente_posicion
            FROM columnas_kanban
            WHERE proyecto_id = $1
            `,
            [projectId]
        );

        const nextPosition =
            Number(positionResult.rows[0].siguiente_posicion);

        const result = await pool.query(
            `
            INSERT INTO columnas_kanban
            (
                proyecto_id,
                nombre,
                posicion,
                color
            )
            VALUES ($1, $2, $3, $4)
            RETURNING *
            `,
            [
                projectId,
                name.trim(),
                nextPosition,
                color?.trim() || null
            ]
        );

        const column = result.rows[0];

        return res.status(201).json({
            id: column.id,
            name: column.nombre,
            position: column.posicion,
            color: column.color,
            createdAt: column.fecha_creacion,
            tasks: []
        });

    } catch (error: any) {
        console.error("Error al crear columna:", error);

        if (error.code === "23505") {
            return res.status(409).json({
                error: "Ya existe una columna con ese nombre"
            });
        }

        return res.status(500).json({
            error: "No fue posible crear la columna"
        });
    }
};

/* =========================
   CREATE TASK
========================= */
export const createKanbanTask = async (
    req: Request,
    res: Response
) => {
    try {
        const projectId = Number(req.params.projectId);
        const userId = (req as any).user.id;

        const {
            columnId,
            title,
            description,
            priority = "media",
            assigneeId,
            dueDate
        } = req.body;

        const parsedColumnId = Number(columnId);

        const parsedAssigneeId =
            assigneeId === null ||
            assigneeId === undefined ||
            assigneeId === ""
                ? null
                : Number(assigneeId);

        if (!Number.isInteger(projectId)) {
            return res.status(400).json({
                error: "El ID del proyecto no es válido"
            });
        }

        if (!Number.isInteger(parsedColumnId)) {
            return res.status(400).json({
                error: "La columna no es válida"
            });
        }

        if (
            parsedAssigneeId !== null &&
            !Number.isInteger(parsedAssigneeId)
        ) {
            return res.status(400).json({
                error: "El responsable no es válido"
            });
        }

        if (!title?.trim()) {
            return res.status(400).json({
                error: "El título de la tarea es obligatorio"
            });
        }

        const allowedPriorities = [
            "baja",
            "media",
            "alta",
            "critica"
        ];

        if (!allowedPriorities.includes(priority)) {
            return res.status(400).json({
                error: "La prioridad no es válida"
            });
        }

        const role = await getProjectMemberRole(
            projectId,
            userId
        );

        if (!role) {
            return res.status(403).json({
                error: "No tienes acceso a este proyecto"
            });
        }

        const pool = obtenerPool();

        const columnResult = await pool.query(
            `
            SELECT id
            FROM columnas_kanban
            WHERE id = $1
              AND proyecto_id = $2
            `,
            [parsedColumnId, projectId]
        );

        if (columnResult.rows.length === 0) {
            return res.status(404).json({
                error: "La columna no pertenece al proyecto"
            });
        }

        if (parsedAssigneeId !== null) {
            const assigneeResult = await pool.query(
                `
                SELECT usuario_id
                FROM miembros_proyecto
                WHERE proyecto_id = $1
                  AND usuario_id = $2
                `,
                [projectId, parsedAssigneeId]
            );

            if (assigneeResult.rows.length === 0) {
                return res.status(400).json({
                    error: "El responsable no pertenece al proyecto"
                });
            }
        }

        const positionResult = await pool.query(
            `
            SELECT COALESCE(MAX(posicion), 0) + 1 AS siguiente_posicion
            FROM tareas_kanban
            WHERE columna_id = $1
            `,
            [parsedColumnId]
        );

        const nextPosition =
            Number(positionResult.rows[0].siguiente_posicion);

        const result = await pool.query(
            `
            INSERT INTO tareas_kanban
            (
                proyecto_id,
                columna_id,
                creador_id,
                responsable_id,
                titulo,
                descripcion,
                prioridad,
                posicion,
                fecha_limite
            )
            VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9
            )
            RETURNING *
            `,
            [
                projectId,
                parsedColumnId,
                userId,
                parsedAssigneeId,
                title.trim(),
                description?.trim() || null,
                priority,
                nextPosition,
                dueDate || null
            ]
        );

        const task = result.rows[0];

        return res.status(201).json({
            id: task.id,
            projectId: task.proyecto_id,
            columnId: task.columna_id,
            creatorId: task.creador_id,
            assigneeId: task.responsable_id,
            title: task.titulo,
            description: task.descripcion,
            priority: task.prioridad,
            position: task.posicion,
            dueDate: task.fecha_limite,
            createdAt: task.fecha_creacion,
            updatedAt: task.fecha_actualizacion
        });

    } catch (error) {
        console.error("Error al crear tarea:", error);

        return res.status(500).json({
            error: "No fue posible crear la tarea"
        });
    }
};

/* =========================
   UPDATE TASK
========================= */
export const updateKanbanTask = async (
    req: Request,
    res: Response
) => {
    try {
        const projectId = Number(req.params.projectId);
        const taskId = Number(req.params.taskId);
        const userId = (req as any).user.id;

        const {
            title,
            description,
            priority,
            assigneeId,
            dueDate
        } = req.body;

        const parsedAssigneeId =
            assigneeId === null ||
            assigneeId === undefined ||
            assigneeId === ""
                ? null
                : Number(assigneeId);

        if (
            !Number.isInteger(projectId) ||
            !Number.isInteger(taskId)
        ) {
            return res.status(400).json({
                error: "Los identificadores no son válidos"
            });
        }

        if (!title?.trim()) {
            return res.status(400).json({
                error: "El título de la tarea es obligatorio"
            });
        }

        if (
            parsedAssigneeId !== null &&
            !Number.isInteger(parsedAssigneeId)
        ) {
            return res.status(400).json({
                error: "El responsable no es válido"
            });
        }

        const allowedPriorities = [
            "baja",
            "media",
            "alta",
            "critica"
        ];

        if (!allowedPriorities.includes(priority)) {
            return res.status(400).json({
                error: "La prioridad no es válida"
            });
        }

        const role = await getProjectMemberRole(
            projectId,
            userId
        );

        if (!role) {
            return res.status(403).json({
                error: "No tienes acceso a este proyecto"
            });
        }

        const pool = obtenerPool();

        if (parsedAssigneeId !== null) {
            const assigneeResult = await pool.query(
                `
                SELECT usuario_id
                FROM miembros_proyecto
                WHERE proyecto_id = $1
                  AND usuario_id = $2
                `,
                [projectId, parsedAssigneeId]
            );

            if (assigneeResult.rows.length === 0) {
                return res.status(400).json({
                    error: "El responsable no pertenece al proyecto"
                });
            }
        }

        const result = await pool.query(
            `
            UPDATE tareas_kanban
            SET
                titulo = $1,
                descripcion = $2,
                prioridad = $3,
                responsable_id = $4,
                fecha_limite = $5,
                fecha_actualizacion = CURRENT_TIMESTAMP
            WHERE id = $6
              AND proyecto_id = $7
            RETURNING *
            `,
            [
                title.trim(),
                description?.trim() || null,
                priority,
                parsedAssigneeId,
                dueDate || null,
                taskId,
                projectId
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Tarea no encontrada"
            });
        }

        const task = result.rows[0];

        return res.json({
            id: task.id,
            projectId: task.proyecto_id,
            columnId: task.columna_id,
            creatorId: task.creador_id,
            assigneeId: task.responsable_id,
            title: task.titulo,
            description: task.descripcion,
            priority: task.prioridad,
            position: task.posicion,
            dueDate: task.fecha_limite,
            createdAt: task.fecha_creacion,
            updatedAt: task.fecha_actualizacion
        });

    } catch (error) {
        console.error("Error al actualizar tarea:", error);

        return res.status(500).json({
            error: "No fue posible actualizar la tarea"
        });
    }
};

/* =========================
   MOVE TASK
========================= */
export const moveKanbanTask = async (
    req: Request,
    res: Response
) => {
    const pool = obtenerPool();
    const client = await pool.connect();

    try {
        const projectId = Number(req.params.projectId);
        const taskId = Number(req.params.taskId);
        const userId = (req as any).user.id;

        const newColumnId = Number(req.body.columnId);
        const requestedPosition = Number(req.body.position);

        if (
            !Number.isInteger(projectId) ||
            !Number.isInteger(taskId) ||
            !Number.isInteger(newColumnId) ||
            !Number.isInteger(requestedPosition)
        ) {
            return res.status(400).json({
                error: "Los datos de movimiento no son válidos"
            });
        }

        const role = await getProjectMemberRole(
            projectId,
            userId
        );

        if (!role) {
            return res.status(403).json({
                error: "No tienes acceso a este proyecto"
            });
        }

        await client.query("BEGIN");

        const taskResult = await client.query(
            `
            SELECT id, columna_id, posicion
            FROM tareas_kanban
            WHERE id = $1
              AND proyecto_id = $2
            FOR UPDATE
            `,
            [taskId, projectId]
        );

        if (taskResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                error: "Tarea no encontrada"
            });
        }

        const columnResult = await client.query(
            `
            SELECT id
            FROM columnas_kanban
            WHERE id = $1
              AND proyecto_id = $2
            `,
            [newColumnId, projectId]
        );

        if (columnResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                error: "La columna no pertenece al proyecto"
            });
        }

        const currentTask = taskResult.rows[0];
        const oldColumnId = currentTask.columna_id;
        const oldPosition = currentTask.posicion;
        const newPosition = Math.max(1, requestedPosition);

        if (oldColumnId === newColumnId) {
            if (newPosition > oldPosition) {
                await client.query(
                    `
                    UPDATE tareas_kanban
                    SET posicion = posicion - 1
                    WHERE columna_id = $1
                      AND posicion > $2
                      AND posicion <= $3
                      AND id <> $4
                    `,
                    [
                        oldColumnId,
                        oldPosition,
                        newPosition,
                        taskId
                    ]
                );
            } else if (newPosition < oldPosition) {
                await client.query(
                    `
                    UPDATE tareas_kanban
                    SET posicion = posicion + 1
                    WHERE columna_id = $1
                      AND posicion >= $2
                      AND posicion < $3
                      AND id <> $4
                    `,
                    [
                        oldColumnId,
                        newPosition,
                        oldPosition,
                        taskId
                    ]
                );
            }
        } else {
            await client.query(
                `
                UPDATE tareas_kanban
                SET posicion = posicion - 1
                WHERE columna_id = $1
                  AND posicion > $2
                `,
                [oldColumnId, oldPosition]
            );

            await client.query(
                `
                UPDATE tareas_kanban
                SET posicion = posicion + 1
                WHERE columna_id = $1
                  AND posicion >= $2
                `,
                [newColumnId, newPosition]
            );
        }

        const result = await client.query(
            `
            UPDATE tareas_kanban
            SET
                columna_id = $1,
                posicion = $2,
                fecha_actualizacion = CURRENT_TIMESTAMP
            WHERE id = $3
              AND proyecto_id = $4
            RETURNING *
            `,
            [
                newColumnId,
                newPosition,
                taskId,
                projectId
            ]
        );

        await client.query("COMMIT");

        const task = result.rows[0];

        return res.json({
            message: "Tarea movida correctamente",
            task: {
                id: task.id,
                projectId: task.proyecto_id,
                columnId: task.columna_id,
                position: task.posicion,
                updatedAt: task.fecha_actualizacion
            }
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error("Error al mover tarea:", error);

        return res.status(500).json({
            error: "No fue posible mover la tarea"
        });

    } finally {
        client.release();
    }
};

/* =========================
   DELETE TASK
========================= */
export const deleteKanbanTask = async (
    req: Request,
    res: Response
) => {
    const pool = obtenerPool();
    const client = await pool.connect();

    try {
        const projectId = Number(req.params.projectId);
        const taskId = Number(req.params.taskId);
        const userId = (req as any).user.id;

        if (
            !Number.isInteger(projectId) ||
            !Number.isInteger(taskId)
        ) {
            return res.status(400).json({
                error: "Los identificadores no son válidos"
            });
        }

        const role = await getProjectMemberRole(
            projectId,
            userId
        );

        if (!role) {
            return res.status(403).json({
                error: "No tienes acceso a este proyecto"
            });
        }

        await client.query("BEGIN");

        const taskResult = await client.query(
            `
            SELECT id, columna_id, posicion
            FROM tareas_kanban
            WHERE id = $1
              AND proyecto_id = $2
            FOR UPDATE
            `,
            [taskId, projectId]
        );

        if (taskResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                error: "Tarea no encontrada"
            });
        }

        const task = taskResult.rows[0];

        await client.query(
            `
            DELETE FROM tareas_kanban
            WHERE id = $1
            `,
            [taskId]
        );

        await client.query(
            `
            UPDATE tareas_kanban
            SET posicion = posicion - 1
            WHERE columna_id = $1
              AND posicion > $2
            `,
            [
                task.columna_id,
                task.posicion
            ]
        );

        await client.query("COMMIT");

        return res.json({
            message: "Tarea eliminada correctamente"
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error("Error al eliminar tarea:", error);

        return res.status(500).json({
            error: "No fue posible eliminar la tarea"
        });

    } finally {
        client.release();
    }
};