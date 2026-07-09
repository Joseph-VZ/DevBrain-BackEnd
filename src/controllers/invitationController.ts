import { Request, Response } from "express";
import { randomBytes } from "crypto";
import { obtenerPool } from "../config/database.js";
import { sendMail, buildInvitationEmail } from "../services/mailer.js";

const VALID_ROLES = ["administrador", "desarrollador", "colaborador", "lector"];

/* Verifica que el usuario sea miembro del proyecto. Devuelve el rol o null. */
async function getMemberRole(projectId: any, userId: any): Promise<string | null> {
    const pool = obtenerPool();
    const result = await pool.query(
        `SELECT rol FROM miembros_proyecto WHERE proyecto_id = $1 AND usuario_id = $2`,
        [projectId, userId]
    );
    return result.rows.length > 0 ? result.rows[0].rol : null;
}

/* =========================
   CREATE INVITATION
   POST /projects/:id/invitations   body: { email, role? }
========================= */
export const createInvitation = async (req: Request, res: Response) => {

    try {
        const projectId = req.params.id;
        const userId = (req as any).user.id;
        const { email } = req.body;
        const role = (req.body.role || "colaborador").toLowerCase();

        if (!email) {
            return res.status(400).json({ error: "El correo es obligatorio" });
        }

        if (!VALID_ROLES.includes(role)) {
            return res.status(400).json({ error: "Rol inválido" });
        }

        const pool = obtenerPool();

        // Solo un miembro del proyecto puede invitar.
        const inviterRole = await getMemberRole(projectId, userId);
        if (!inviterRole) {
            return res.status(404).json({ error: "Proyecto no encontrado o sin acceso" });
        }

        const projectResult = await pool.query(
            `SELECT nombre FROM proyectos WHERE id = $1`,
            [projectId]
        );
        if (projectResult.rows.length === 0) {
            return res.status(404).json({ error: "Proyecto no encontrado" });
        }
        const projectName = projectResult.rows[0].nombre;

        // ¿El invitado ya es miembro?
        const alreadyMember = await pool.query(
            `
            SELECT mp.id
            FROM miembros_proyecto mp
            INNER JOIN usuarios u ON u.id = mp.usuario_id
            WHERE mp.proyecto_id = $1 AND u.correo = $2
            `,
            [projectId, email]
        );
        if (alreadyMember.rows.length > 0) {
            return res.status(409).json({ error: "Esa persona ya es miembro del proyecto" });
        }

        // ¿Ya hay una invitación pendiente?
        const pending = await pool.query(
            `
            SELECT id FROM invitaciones_proyecto
            WHERE proyecto_id = $1 AND correo = $2 AND estado = 'pendiente'
            `,
            [projectId, email]
        );
        if (pending.rows.length > 0) {
            return res.status(409).json({ error: "Ya existe una invitación pendiente para ese correo" });
        }

        const token = randomBytes(24).toString("hex");

        const inserted = await pool.query(
            `
            INSERT INTO invitaciones_proyecto
                (proyecto_id, correo, rol, token, invitado_por)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
            `,
            [projectId, email, role, token, userId]
        );

        const invitation = inserted.rows[0];

        // Datos de quien invita (para el correo).
        const inviter = await pool.query(
            `SELECT nombre FROM usuarios WHERE id = $1`,
            [userId]
        );
        const inviterName = inviter.rows[0]?.nombre || "Un miembro del equipo";

        const appUrl = process.env.APP_URL || "http://localhost:5173";
        const acceptUrl = `${appUrl}/invitations/accept?token=${token}`;

        const mail = buildInvitationEmail({ projectName, inviterName, acceptUrl, role });

        try {
            await sendMail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
        } catch (mailError) {
            // No fallamos la request si el correo no se pudo enviar; la invitación queda creada.
            console.error("Error al enviar el correo de invitación:", mailError);
        }

        return res.status(201).json({
            id: invitation.id,
            projectId: invitation.proyecto_id,
            email: invitation.correo,
            role: invitation.rol,
            status: invitation.estado,
            createdAt: invitation.fecha_creacion,
            acceptUrl
        });

    } catch (error) {
        return res.status(500).json({ error: "Error al crear la invitación" });
    }
};

/* =========================
   LIST INVITATIONS
   GET /projects/:id/invitations
========================= */
export const listInvitations = async (req: Request, res: Response) => {

    try {
        const projectId = req.params.id;
        const userId = (req as any).user.id;

        const role = await getMemberRole(projectId, userId);
        if (!role) {
            return res.status(404).json({ error: "Proyecto no encontrado o sin acceso" });
        }

        const pool = obtenerPool();

        const result = await pool.query(
            `
            SELECT id, correo, rol, estado, fecha_creacion
            FROM invitaciones_proyecto
            WHERE proyecto_id = $1
            ORDER BY fecha_creacion DESC
            `,
            [projectId]
        );

        const invitations = result.rows.map(row => ({
            id: row.id,
            email: row.correo,
            role: row.rol,
            status: row.estado,
            createdAt: row.fecha_creacion
        }));

        return res.json(invitations);

    } catch (error) {
        return res.status(500).json({ error: "Error al obtener las invitaciones" });
    }
};

/* =========================
   LIST MEMBERS
   GET /projects/:id/members
========================= */
export const listMembers = async (req: Request, res: Response) => {

    try {
        const projectId = req.params.id;
        const userId = (req as any).user.id;

        const role = await getMemberRole(projectId, userId);
        if (!role) {
            return res.status(404).json({ error: "Proyecto no encontrado o sin acceso" });
        }

        const pool = obtenerPool();

        const result = await pool.query(
            `
            SELECT
                u.id,
                u.nombre,
                u.correo,
                mp.rol,
                mp.fecha_union
            FROM miembros_proyecto mp
            INNER JOIN usuarios u ON u.id = mp.usuario_id
            WHERE mp.proyecto_id = $1
            ORDER BY mp.fecha_union ASC
            `,
            [projectId]
        );

        const members = result.rows.map(row => ({
            id: row.id,
            name: row.nombre,
            email: row.correo,
            role: row.rol,
            joinedAt: row.fecha_union
        }));

        return res.json(members);

    } catch (error) {
        return res.status(500).json({ error: "Error al obtener los miembros" });
    }
};

/* =========================
   CANCEL INVITATION
   DELETE /projects/:id/invitations/:invitationId
========================= */
export const cancelInvitation = async (req: Request, res: Response) => {

    try {
        const projectId = req.params.id;
        const invitationId = req.params.invitationId;
        const userId = (req as any).user.id;

        const role = await getMemberRole(projectId, userId);
        if (!role) {
            return res.status(404).json({ error: "Proyecto no encontrado o sin acceso" });
        }

        const pool = obtenerPool();

        const result = await pool.query(
            `
            UPDATE invitaciones_proyecto
            SET estado = 'cancelada', fecha_respuesta = NOW()
            WHERE id = $1 AND proyecto_id = $2 AND estado = 'pendiente'
            RETURNING id
            `,
            [invitationId, projectId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Invitación no encontrada o ya no está pendiente"
            });
        }

        return res.json({ message: "Invitación cancelada" });

    } catch (error) {
        return res.status(500).json({ error: "Error al cancelar la invitación" });
    }
};

/* =========================
   GET INVITATION BY TOKEN
   GET /invitations/:token
========================= */
export const getInvitationByToken = async (req: Request, res: Response) => {

    try {
        const { token } = req.params;
        const pool = obtenerPool();

        const result = await pool.query(
            `
            SELECT
                i.id,
                i.correo,
                i.rol,
                i.estado,
                p.nombre AS proyecto_nombre,
                p.id AS proyecto_id
            FROM invitaciones_proyecto i
            INNER JOIN proyectos p ON p.id = i.proyecto_id
            WHERE i.token = $1
            `,
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Invitación no encontrada" });
        }

        const row = result.rows[0];

        return res.json({
            email: row.correo,
            role: row.rol,
            status: row.estado,
            projectId: row.proyecto_id,
            projectName: row.proyecto_nombre
        });

    } catch (error) {
        return res.status(500).json({ error: "Error al obtener la invitación" });
    }
};

/* =========================
   ACCEPT INVITATION
   POST /invitations/accept   body: { token }
========================= */
export const acceptInvitation = async (req: Request, res: Response) => {

    const client = await obtenerPool().connect();

    try {
        const userId = (req as any).user.id;
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({ error: "El token es obligatorio" });
        }

        await client.query("BEGIN");

        const invitationResult = await client.query(
            `SELECT * FROM invitaciones_proyecto WHERE token = $1 FOR UPDATE`,
            [token]
        );

        if (invitationResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Invitación no encontrada" });
        }

        const invitation = invitationResult.rows[0];

        if (invitation.estado !== "pendiente") {
            await client.query("ROLLBACK");
            return res.status(409).json({ error: "La invitación ya no está disponible" });
        }

        // El correo de la invitación debe coincidir con el del usuario autenticado.
        const userResult = await client.query(
            `SELECT correo FROM usuarios WHERE id = $1`,
            [userId]
        );
        const userEmail = userResult.rows[0]?.correo;

        if (userEmail !== invitation.correo) {
            await client.query("ROLLBACK");
            return res.status(403).json({
                error: "Esta invitación fue enviada a otro correo"
            });
        }

        // Registrar como miembro (idempotente por el UNIQUE usuario/proyecto).
        await client.query(
            `
            INSERT INTO miembros_proyecto (usuario_id, proyecto_id, rol)
            VALUES ($1, $2, $3)
            ON CONFLICT (usuario_id, proyecto_id) DO NOTHING
            `,
            [userId, invitation.proyecto_id, invitation.rol]
        );

        await client.query(
            `
            UPDATE invitaciones_proyecto
            SET estado = 'aceptada', fecha_respuesta = NOW()
            WHERE id = $1
            `,
            [invitation.id]
        );

        await client.query("COMMIT");

        return res.json({
            message: "Invitación aceptada",
            projectId: invitation.proyecto_id
        });

    } catch (error) {
        await client.query("ROLLBACK");
        return res.status(500).json({ error: "Error al aceptar la invitación" });
    } finally {
        client.release();
    }
};
