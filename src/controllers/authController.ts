import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { obtenerPool } from "../config/database.js";



/* =========================
   REGISTER
========================= */
export const register = async (req: Request, res: Response) => {
    const { name, email, password } = req.body;

    const pool = obtenerPool();

    // verificar si existe
    const user = await pool.query(
        "SELECT * FROM usuarios WHERE correo = $1",
        [email]
    );

    if (user.rows.length > 0) {
        return res.status(400).json({
            error: "El correo ya está registrado"
        });
    }

    // hash password
    const hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
        `INSERT INTO usuarios (nombre, correo, contrasena_hash)
         VALUES ($1, $2, $3)
         RETURNING id, nombre, correo`,
        [name, email, hash]
    );

    return res.status(201).json(result.rows[0]);
};

/* =========================
   LOGIN
========================= */
export const login = async (req: Request, res: Response) => {
    const JWT_SECRET = process.env.JWT_SECRET!;

    const { email, password } = req.body;

    const pool = obtenerPool();

    const result = await pool.query(
        "SELECT * FROM usuarios WHERE correo = $1",
        [email]
    );

    if (result.rows.length === 0) {
        return res.status(401).json({
            error: "Credenciales inválidas"
        });
    }

    const user = result.rows[0];

    const valid = await bcrypt.compare(password, user.contrasena_hash);

    if (!valid) {
        return res.status(401).json({
            error: "Credenciales inválidas"
        });
    }

    const token = jwt.sign(
        { id: user.id },
        JWT_SECRET,
        { expiresIn: "1d" }
    );

    return res.json({
        token,
        user: {
            id: user.id,
            name: user.nombre,
            email: user.correo
        }
    });
};

/* =========================
   ME
========================= */
export const me = async (req: Request, res: Response) => {
    const JWT_SECRET = process.env.JWT_SECRET!;

    try {
        const auth = req.headers.authorization;

        if (!auth) {
            return res.status(401).json({ error: "Token requerido" });
        }

        const token = auth.split(" ")[1];

        const decoded = jwt.verify(token, JWT_SECRET) as any;

        const pool = obtenerPool();

        const result = await pool.query(
            "SELECT id, nombre, correo FROM usuarios WHERE id = $1",
            [decoded.id]
        );

        return res.json(result.rows[0]);

    } catch (error) {
        return res.status(401).json({
            error: "Token inválido"
        });
    }
};