import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { conectarBaseDatos } from "./config/database.js";
import authRoutes from "./routes/auth.routes.js";
import projectRoutes from "./routes/project.routes.js";
import decisionRoutes from "./routes/decision.routes.js";
import voteRoutes from "./routes/vote.routes.js";
import invitationRoutes from "./routes/invitation.routes.js";
import aiRoutes from "./routes/ai.routes.js";

const app = express();

app.use(express.json());

app.use("/auth", authRoutes);
app.use("/projects", projectRoutes);
app.use("/decisions", decisionRoutes);
app.use("/votes", voteRoutes);
app.use("/invitations", invitationRoutes);
app.use("/ai", aiRoutes);

app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3000;

conectarBaseDatos();

app.listen(PORT, () => {
    console.log(`DevBrain backend running on port ${PORT}`);
});

console.log("DATABASE_URL =>", process.env.DATABASE_URL);
