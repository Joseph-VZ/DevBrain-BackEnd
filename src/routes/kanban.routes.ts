import { Router } from "express";

import {
    getKanban,
    createKanbanColumn,
    createKanbanTask,
    updateKanbanTask,
    moveKanbanTask,
    deleteKanbanTask
} from "../controllers/kanbanController.js";

import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authMiddleware);

/* =========================
   TABLERO
========================= */

// Obtener tablero completo del proyecto
router.get(
    "/:projectId/kanban",
    getKanban
);

/* =========================
   COLUMNAS
========================= */

// Crear columna
router.post(
    "/:projectId/kanban/columns",
    createKanbanColumn
);

/* =========================
   TAREAS
========================= */

// Crear tarea
router.post(
    "/:projectId/tasks",
    createKanbanTask
);

// Actualizar tarea
router.put(
    "/:projectId/tasks/:taskId",
    updateKanbanTask
);

// Mover tarea entre columnas o cambiar posición
router.patch(
    "/:projectId/tasks/:taskId/move",
    moveKanbanTask
);

// Eliminar tarea
router.delete(
    "/:projectId/tasks/:taskId",
    deleteKanbanTask
);

export default router;