import { Router } from "express";
import { getProjects, createProject } from "../controllers/projectsController.js";

const router = Router();

router.get("/", getProjects);
router.post("/", createProject);

export default router;