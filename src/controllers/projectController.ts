import { Request, Response } from "express";
import { obtenerPool } from "../config/database.js";

/* =========================
   GET PROJECTS
========================= */
export const getProjects = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;

        const pool = obtenerPool();

        const result = await pool.query(
            `
            SELECT
                p.id,
                p.nombre,
                p.descripcion,
                p.fecha_creacion
            FROM proyectos p
            INNER JOIN miembros_proyecto mp
                ON p.id = mp.proyecto_id
            WHERE mp.usuario_id = $1
            ORDER BY p.id DESC
            `,
            [userId]
        );

        const projects = result.rows.map(project => ({
            id: project.id,
            name: project.nombre,
            description: project.descripcion,
            createdAt: project.fecha_creacion
        }));

        return res.json(projects);

    } catch (error) {
        return res.status(500).json({
            error: "Error al obtener los proyectos"
        });
    }
};

/* =========================
   GET PROJECT BY ID
========================= */
export const getProjectById = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;

        const pool = obtenerPool();

        const result = await pool.query(
            `
            SELECT
                p.id,
                p.nombre,
                p.descripcion,
                p.fecha_creacion
            FROM proyectos p
            INNER JOIN miembros_proyecto mp
                ON p.id = mp.proyecto_id
            WHERE
                p.id = $1
            AND mp.usuario_id = $2
            `,
            [id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Proyecto no encontrado"
            });
        }

        const project = result.rows[0];

        return res.json({
            id: project.id,
            name: project.nombre,
            description: project.descripcion,
            createdAt: project.fecha_creacion
        });

    } catch (error) {
        return res.status(500).json({
            error: "Error al obtener el proyecto"
        });
    }
};

/* =========================
   CREATE PROJECT
========================= */
export const createProject = async (req: Request, res: Response) => {
    try {

        const { name, description } = req.body;
        const userId = (req as any).user.id;

        if (!name) {
            return res.status(400).json({
                error: "El nombre del proyecto es obligatorio"
            });
        }

        const pool = obtenerPool();

        const projectResult = await pool.query(
            `
            INSERT INTO proyectos
            (nombre, descripcion)
            VALUES ($1, $2)
            RETURNING *
            `,
            [name, description]
        );

        const project = projectResult.rows[0];

        await pool.query(
            `
            INSERT INTO miembros_proyecto
            (usuario_id, proyecto_id, rol)
            VALUES ($1, $2, 'administrador')
            `,
            [userId, project.id]
        );

        return res.status(201).json({
            id: project.id,
            name: project.nombre,
            description: project.descripcion,
            createdAt: project.fecha_creacion
        });

    } catch (error) {
        return res.status(500).json({
            error: "Error al crear el proyecto"
        });
    }
};

/* =========================
   UPDATE PROJECT
========================= */
export const updateProject = async (req: Request, res: Response) => {

    try {

        const { id } = req.params;
        const { name, description } = req.body;
        const userId = (req as any).user.id;

        const pool = obtenerPool();

        const exists = await pool.query(
            `
            SELECT p.id
            FROM proyectos p
            INNER JOIN miembros_proyecto mp
            ON p.id = mp.proyecto_id
            WHERE
                p.id = $1
            AND mp.usuario_id = $2
            `,
            [id, userId]
        );

        if (exists.rows.length === 0) {
            return res.status(404).json({
                error: "Proyecto no encontrado"
            });
        }

        const result = await pool.query(
            `
            UPDATE proyectos
            SET
                nombre = $1,
                descripcion = $2
            WHERE id = $3
            RETURNING *
            `,
            [name, description, id]
        );

        const project = result.rows[0];

        return res.json({
            id: project.id,
            name: project.nombre,
            description: project.descripcion,
            createdAt: project.fecha_creacion
        });

    } catch (error) {
        return res.status(500).json({
            error: "Error al actualizar el proyecto"
        });
    }
};

/* =========================
   DELETE PROJECT
========================= */
export const deleteProject = async (req: Request, res: Response) => {

    try {

        const { id } = req.params;
        const userId = (req as any).user.id;

        const pool = obtenerPool();

        const exists = await pool.query(
            `
            SELECT p.id
            FROM proyectos p
            INNER JOIN miembros_proyecto mp
            ON p.id = mp.proyecto_id
            WHERE
                p.id = $1
            AND mp.usuario_id = $2
            `,
            [id, userId]
        );

        if (exists.rows.length === 0) {
            return res.status(404).json({
                error: "Proyecto no encontrado"
            });
        }

        await pool.query(
            "DELETE FROM proyectos WHERE id = $1",
            [id]
        );

        return res.json({
            message: "Proyecto eliminado correctamente"
        });

    } catch (error) {
        return res.status(500).json({
            error: "Error al eliminar el proyecto"
        });
    }
};