/*
 DevBrain - Migración 002
 Invitaciones a proyectos por correo electrónico.

 Permite invitar a una persona (por correo) a participar en un proyecto.
 La invitación genera un token único; al aceptarla, el usuario autenticado
 queda registrado en miembros_proyecto con el rol indicado.
*/

CREATE TABLE IF NOT EXISTS invitaciones_proyecto (

    id SERIAL PRIMARY KEY,

    proyecto_id INTEGER NOT NULL,

    correo VARCHAR(150) NOT NULL,

    rol VARCHAR(30) NOT NULL DEFAULT 'colaborador',

    token VARCHAR(120) NOT NULL UNIQUE,

    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',

    invitado_por INTEGER NOT NULL,

    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    fecha_respuesta TIMESTAMP,

    CONSTRAINT fk_invitacion_proyecto
        FOREIGN KEY (proyecto_id)
        REFERENCES proyectos(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_invitacion_usuario
        FOREIGN KEY (invitado_por)
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_invitacion_rol
        CHECK (
            rol IN (
                'administrador',
                'desarrollador',
                'colaborador',
                'lector'
            )
        ),

    CONSTRAINT chk_invitacion_estado
        CHECK (
            estado IN (
                'pendiente',
                'aceptada',
                'cancelada'
            )
        )

);

CREATE INDEX IF NOT EXISTS idx_invitacion_proyecto
ON invitaciones_proyecto(proyecto_id);

CREATE INDEX IF NOT EXISTS idx_invitacion_correo
ON invitaciones_proyecto(correo);

-- Evita invitaciones pendientes duplicadas para el mismo correo/proyecto.
CREATE UNIQUE INDEX IF NOT EXISTS uq_invitacion_pendiente
ON invitaciones_proyecto(proyecto_id, correo)
WHERE estado = 'pendiente';
