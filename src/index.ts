import express from "express";
import dotenv from "dotenv";
import { conectarBaseDatos } from "./config/database.js";

import authRoutes from "./routes/auth.routes.js";
import projectRoutes from "./routes/project.routes.js";

dotenv.config();

const app = express();

app.use(express.json());

// RUTAS
app.use("/auth", authRoutes);
app.use("/projects", projectRoutes);

// HEALTH CHECK
app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3000;

// Conectar a la base de datos
conectarBaseDatos();

app.listen(PORT, () => {
    console.log(`DevBrain backend running on port ${PORT}`);
});

// DEBUG (opcional)
console.log("DATABASE_URL =>", process.env.DATABASE_URL);
console.log("JWT_SECRET =>", process.env.JWT_SECRET);