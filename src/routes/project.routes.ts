import { Router } from "express";

import {
    getProjects,
    getProjectById,
    createProject,
    updateProject,
    deleteProject
} from "../controllers/projectController.js";

import {
    createInvitation,
    listInvitations,
    listMembers,
    cancelInvitation,
    removeMember
} from "../controllers/invitationController.js";

import { authMiddleware} from "../middleware/auth.middleware.js";

const router = Router();

router.use(authMiddleware);

router.get("/", getProjects);
router.post("/", createProject);
router.get("/:id", getProjectById);
router.put("/:id", updateProject);
router.delete("/:id", deleteProject);

// Miembros e invitaciones del proyecto
router.get("/:id/members", listMembers);
router.delete("/:id/members/:userId", removeMember);
router.get("/:id/invitations", listInvitations);
router.post("/:id/invitations", createInvitation);
router.delete("/:id/invitations/:invitationId", cancelInvitation);

export default router;