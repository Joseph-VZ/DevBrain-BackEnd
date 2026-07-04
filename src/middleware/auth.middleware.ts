import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

export const authMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const authHeader = req.headers.authorization;

        // Verifica que exista el header y tenga el formato correcto
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                error: "Token requerido"
            });
        }

        const token = authHeader.split(" ")[1];

        // Verifica firma y expiración del JWT
        const decoded = jwt.verify(token, JWT_SECRET);

        (req as any).user = decoded;

        next();

    } catch (error) {
        return res.status(401).json({
            error: "Token inválido o expirado"
        });
    }
};