import { Router } from "express";

import { postVote, getVotes } from "../controllers/voteController.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authMiddleware);

router.post("/", postVote);
router.get("/", getVotes);

export default router;