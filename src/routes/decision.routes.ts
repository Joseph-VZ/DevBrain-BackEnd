import { Router } from "express";

import {
    createDecision,
    getDecisions
} from "../controllers/decisionController.js";

import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authMiddleware);

router.post("/", createDecision);
router.get("/", getDecisions);

export default router;