import { Router } from "express";

import {
    createDecision,
    getDecisions
} from "../controllers/decisionController.js";

import {
    listComments,
    createComment
} from "../controllers/commentController.js";

import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authMiddleware);

router.post("/", createDecision);
router.get("/", getDecisions);

router.get("/:id/comments", listComments);
router.post("/:id/comments", createComment);

export default router;