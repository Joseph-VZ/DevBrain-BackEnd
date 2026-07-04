import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export const authMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const JWT_SECRET = process.env.JWT_SECRET;
        const authHeader = req.headers.authorization;

        if (!JWT_SECRET) {
            return res.status(500).json({
                error: "JWT_SECRET no configurado"
            });
        }

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                error: "Token requerido"
            });
        }

        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        (req as any).user = decoded;

        next();

    } catch (error) {
        return res.status(401).json({
            error: "Token invalido o expirado"
        });
    }
};
