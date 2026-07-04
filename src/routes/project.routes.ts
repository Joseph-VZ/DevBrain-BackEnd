import { Router } from "express";

import {
    getProjects,
    getProjectById,
    createProject,
    updateProject,
    deleteProject
} from "../controllers/projectController.js";

import { authMiddleware} from "../middleware/auth.middleware.js";

const router = Router();

router.use(authMiddleware);

router.get("/", getProjects);
router.post("/", createProject);
router.get("/:id", getProjectById);
router.put("/:id", updateProject);
router.delete("/:id", deleteProject);

export default router;