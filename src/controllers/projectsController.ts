import { Request, Response } from "express";
import { obtenerPool } from "../config/database.js";

/* =========================
   GET PROJECTS
========================= */
export const getProjects = async (req: Request, res: Response) => {
    const pool = obtenerPool();

    const result = await pool.query(
        "SELECT * FROM proyectos ORDER BY id DESC"
    );

    return res.json(result.rows);
};

/* =========================
   CREATE PROJECT
========================= */
export const createProject = async (req: Request, res: Response) => {
    const { name, description } = req.body;

    const pool = obtenerPool();

    const result = await pool.query(
        `INSERT INTO proyectos (nombre, descripcion)
         VALUES ($1, $2)
         RETURNING *`,
        [name, description]
    );

    return res.status(201).json(result.rows[0]);
};