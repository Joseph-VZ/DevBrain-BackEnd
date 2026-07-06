import { Router } from "express";
import { aiQuery } from "../controllers/aiController.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authMiddleware);

router.post("/query", aiQuery);

export default router;