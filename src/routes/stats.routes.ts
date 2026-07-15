import { Router } from "express";

import {
    getProjectStats
} from "../controllers/statsController.js";

import {
    authMiddleware
} from "../middleware/auth.middleware.js";


const router = Router();


router.use(authMiddleware);


router.get(
    "/:id/stats",
    getProjectStats
);


export default router;