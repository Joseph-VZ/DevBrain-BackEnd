import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { conectarBaseDatos } from "./config/database.js";
import authRoutes from "./routes/auth.routes.js"; // <-- Agregar

const app = express();

app.use(express.json());

// Registrar rutas de autenticación
app.use("/auth", authRoutes);

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

console.log("DATABASE_URL =>", process.env.DATABASE_URL);