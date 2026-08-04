import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { obtenerPool } from "../config/database.js";
import {
    sendMail,
    buildVerificationEmail
} from "../services/mailer.js";



/* =========================
   REGISTER
========================= */
export const register = async (req: Request, res: Response) => {
    try {
        const { name, email, password } = req.body;

        const pool = obtenerPool();

        // Verificar si el correo ya existe
        const user = await pool.query(
            "SELECT id FROM usuarios WHERE correo = $1",
            [email]
        );

        if (user.rows.length > 0) {
            return res.status(400).json({
                error: "El correo ya está registrado"
            });
        }

        // Encriptar contraseña
        const hash = await bcrypt.hash(password, 10);

        // Generar token de verificación
        const verificationToken = crypto
            .randomBytes(32)
            .toString("hex");

        // El token expira en 24 horas
        const verificationTokenExpires = new Date(
            Date.now() + 24 * 60 * 60 * 1000
        );

        const result = await pool.query(
            `INSERT INTO usuarios (
                nombre,
                correo,
                contrasena_hash,
                correo_verificado,
                token_verificacion,
                token_verificacion_expira
            )
            VALUES ($1, $2, $3, FALSE, $4, $5)
            RETURNING
                id,
                nombre,
                correo,
                correo_verificado`,
            [
                name,
                email,
                hash,
                verificationToken,
                verificationTokenExpires
            ]
        );

        const frontendUrl =
            process.env.FRONTEND_URL || "http://localhost:5173";

        const verificationUrl =
            `${frontendUrl}/verify-email/${verificationToken}`;

        const verificationEmail = buildVerificationEmail({
            userName: name,
            verificationUrl
        });

        await sendMail({
            to: email,
            subject: verificationEmail.subject,
            html: verificationEmail.html,
            text: verificationEmail.text
        });

        return res.status(201).json({
            message: "Registro exitoso. Revisa tu correo para verificar tu cuenta.",
            user: {
                id: result.rows[0].id,
                name: result.rows[0].nombre,
                email: result.rows[0].correo,
                emailVerified: result.rows[0].correo_verificado
            }
        });

    } catch (error) {
        console.error("Error al registrar usuario:", error);

        return res.status(500).json({
            error: "No fue posible registrar al usuario"
        });
    }
};


/* =========================
   VERIFY EMAIL
========================= */
export const verifyEmail = async (req: Request, res: Response) => {
    try {
        const { token } = req.params;

        const pool = obtenerPool();

        const result = await pool.query(
            `SELECT
                id,
                correo_verificado,
                token_verificacion_expira
             FROM usuarios
             WHERE token_verificacion = $1`,
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({
                error: "El enlace de verificación no es válido"
            });
        }

        const user = result.rows[0];

        if (
            !user.token_verificacion_expira ||
            new Date(user.token_verificacion_expira) < new Date()
        ) {
            return res.status(400).json({
                error: "El enlace de verificación ha expirado"
            });
        }

        await pool.query(
            `UPDATE usuarios
             SET
                correo_verificado = TRUE,
                token_verificacion = NULL,
                token_verificacion_expira = NULL
             WHERE id = $1`,
            [user.id]
        );

        return res.status(200).json({
            message: "Cuenta verificada correctamente"
        });

    } catch (error) {
        console.error("Error al verificar correo:", error);

        return res.status(500).json({
            error: "No fue posible verificar la cuenta"
        });
    }
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
    if (!user.correo_verificado) {
    return res.status(403).json({
        code: "EMAIL_NOT_VERIFIED",
        error: "Debes verificar tu correo electrónico antes de iniciar sesión"
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