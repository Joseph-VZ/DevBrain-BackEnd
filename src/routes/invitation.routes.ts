import { Router } from "express";

import {
    getInvitationByToken,
    acceptInvitation
} from "../controllers/invitationController.js";

import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authMiddleware);

router.post("/accept", acceptInvitation);
router.get("/:token", getInvitationByToken);

export default router;
