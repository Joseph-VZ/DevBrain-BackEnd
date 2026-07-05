import { Router } from "express";

import { postVote } from "../controllers/voteController.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authMiddleware);

router.post("/", postVote);

export default router;