/*
 DevBrain - Schema inicial PostgreSQL

 Autor: Equipo DevBrain
 Descripción:
 Base de datos inicial para el MVP de DevBrain.
 
 Nota:
 La base de datos utiliza nombres de tablas y columnas en español.
 El backend será responsable de mapear los nombres definidos en la API REST
 (por ejemplo: email, name, projectId, title) hacia este esquema.

 Convención del proyecto:
 API REST (Frontend ↔ Backend): inglés.
 Base de datos (Backend ↔ PostgreSQL): español.
*/


-- TABLA: USUARIOS

CREATE TABLE usuarios (

    id SERIAL PRIMARY KEY,

    nombre VARCHAR(100) NOT NULL,

    correo VARCHAR(150) NOT NULL UNIQUE,

    contrasena_hash TEXT NOT NULL,

    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP

);


-- TABLA: PROYECTOS

CREATE TABLE proyectos (

    id SERIAL PRIMARY KEY,

    nombre VARCHAR(150) NOT NULL,

    descripcion TEXT,

    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP

);


-- TABLA: MIEMBROS DEL PROYECTO

CREATE TABLE miembros_proyecto (

    id SERIAL PRIMARY KEY,

    usuario_id INTEGER NOT NULL,

    proyecto_id INTEGER NOT NULL,

    rol VARCHAR(30) NOT NULL,

    fecha_union TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_miembro_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_miembro_proyecto
        FOREIGN KEY (proyecto_id)
        REFERENCES proyectos(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_usuario_proyecto
        UNIQUE(usuario_id, proyecto_id),

    CONSTRAINT chk_rol
        CHECK (
            rol IN (
                'administrador',
                'desarrollador',
                'colaborador',
                'lector'
            )
        )

);


-- TABLA: CATEGORÍAS

CREATE TABLE categorias (

    id SERIAL PRIMARY KEY,

    nombre VARCHAR(100) NOT NULL UNIQUE,

    descripcion TEXT

);


-- TABLA: DECISIONES

CREATE TABLE decisiones (

    id SERIAL PRIMARY KEY,

    proyecto_id INTEGER NOT NULL,

    usuario_proponente_id INTEGER NOT NULL,

    categoria_id INTEGER,

    titulo VARCHAR(200) NOT NULL,

    descripcion TEXT NOT NULL,

    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',

    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_decision_proyecto
        FOREIGN KEY (proyecto_id)
        REFERENCES proyectos(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_decision_usuario
        FOREIGN KEY (usuario_proponente_id)
        REFERENCES usuarios(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_decision_categoria
        FOREIGN KEY (categoria_id)
        REFERENCES categorias(id)
        ON DELETE SET NULL,

    CONSTRAINT chk_estado
        CHECK (
            estado IN (
                'pendiente',
                'aprobada',
                'rechazada'
            )
        )

);


-- TABLA: ALTERNATIVAS DE DECISIÓN

CREATE TABLE alternativas_decision (

    id SERIAL PRIMARY KEY,

    decision_id INTEGER NOT NULL,

    nombre VARCHAR(150) NOT NULL,

    ventajas TEXT,

    desventajas TEXT,

    CONSTRAINT fk_alternativa_decision
        FOREIGN KEY (decision_id)
        REFERENCES decisiones(id)
        ON DELETE CASCADE

);


-- TABLA: VOTOS

CREATE TABLE votos (

    id SERIAL PRIMARY KEY,

    decision_id INTEGER NOT NULL,

    usuario_id INTEGER NOT NULL,

    voto VARCHAR(20) NOT NULL,

    comentario TEXT,

    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_voto_decision
        FOREIGN KEY (decision_id)
        REFERENCES decisiones(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_voto_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_voto_usuario
        UNIQUE(decision_id, usuario_id),

    CONSTRAINT chk_voto
        CHECK (
            voto IN (
                'aprobar',
                'rechazar',
                'neutral'
            )
        )

);


-- TABLA: PARTICIPANTES DE UNA DECISIÓN

CREATE TABLE participantes_decision (

    id SERIAL PRIMARY KEY,

    decision_id INTEGER NOT NULL,

    usuario_id INTEGER NOT NULL,

    rol_participacion VARCHAR(50) NOT NULL,

    CONSTRAINT fk_participante_decision
        FOREIGN KEY (decision_id)
        REFERENCES decisiones(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_participante_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_participante
        UNIQUE(decision_id, usuario_id)

);


-- TABLA: IMPACTOS DE UNA DECISIÓN

CREATE TABLE impactos_decision (

    id SERIAL PRIMARY KEY,

    decision_id INTEGER NOT NULL,

    tipo VARCHAR(20) NOT NULL,

    descripcion TEXT NOT NULL,

    nivel_impacto VARCHAR(20) NOT NULL,

    CONSTRAINT fk_impacto_decision
        FOREIGN KEY (decision_id)
        REFERENCES decisiones(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_tipo
        CHECK (
            tipo IN (
                'tecnico',
                'empresarial',
                'economico'
            )
        ),

    CONSTRAINT chk_nivel
        CHECK (
            nivel_impacto IN (
                'bajo',
                'medio',
                'alto'
            )
        )

);


-- TABLA: HISTORIAL DE CONOCIMIENTO

CREATE TABLE historial_conocimiento (

    id SERIAL PRIMARY KEY,

    decision_id INTEGER NOT NULL,

    pregunta TEXT NOT NULL,

    respuesta TEXT NOT NULL,

    fecha_registro TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_historial_decision
        FOREIGN KEY (decision_id)
        REFERENCES decisiones(id)
        ON DELETE CASCADE

);


-- ÍNDICES

CREATE INDEX idx_proyecto_nombre
ON proyectos(nombre);

CREATE INDEX idx_decision_estado
ON decisiones(estado);

CREATE INDEX idx_decision_proyecto
ON decisiones(proyecto_id);

CREATE INDEX idx_decision_categoria
ON decisiones(categoria_id);

CREATE INDEX idx_decision_fecha
ON decisiones(fecha_creacion);

CREATE INDEX idx_voto_decision
ON votos(decision_id);

CREATE INDEX idx_voto_usuario
ON votos(usuario_id);

CREATE INDEX idx_participante_usuario
ON participantes_decision(usuario_id);

CREATE INDEX idx_historial_decision
ON historial_conocimiento(decision_id);


-- FIN DEL ESQUEMA