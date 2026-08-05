-- =====================================================
-- KANBAN BÁSICO POR PROYECTO
-- =====================================================

-- Columnas del tablero Kanban
CREATE TABLE IF NOT EXISTS columnas_kanban (
    id SERIAL PRIMARY KEY,
    proyecto_id INTEGER NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    posicion INTEGER NOT NULL DEFAULT 0,
    color VARCHAR(20),
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_columnas_kanban_proyecto
        FOREIGN KEY (proyecto_id)
        REFERENCES proyectos(id)
        ON DELETE CASCADE
);

-- Evita nombres repetidos dentro del mismo proyecto
CREATE UNIQUE INDEX IF NOT EXISTS uq_columnas_kanban_proyecto_nombre
ON columnas_kanban(proyecto_id, nombre);

-- Mejora las consultas ordenadas por proyecto y posición
CREATE INDEX IF NOT EXISTS idx_columnas_kanban_proyecto_posicion
ON columnas_kanban(proyecto_id, posicion);


-- Tareas del tablero Kanban
CREATE TABLE IF NOT EXISTS tareas_kanban (
    id SERIAL PRIMARY KEY,
    proyecto_id INTEGER NOT NULL,
    columna_id INTEGER NOT NULL,
    creador_id INTEGER NOT NULL,
    responsable_id INTEGER,
    titulo VARCHAR(180) NOT NULL,
    descripcion TEXT,
    prioridad VARCHAR(20) NOT NULL DEFAULT 'media',
    posicion INTEGER NOT NULL DEFAULT 0,
    fecha_limite TIMESTAMP,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_tareas_kanban_proyecto
        FOREIGN KEY (proyecto_id)
        REFERENCES proyectos(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_tareas_kanban_columna
        FOREIGN KEY (columna_id)
        REFERENCES columnas_kanban(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_tareas_kanban_creador
        FOREIGN KEY (creador_id)
        REFERENCES usuarios(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_tareas_kanban_responsable
        FOREIGN KEY (responsable_id)
        REFERENCES usuarios(id)
        ON DELETE SET NULL,

    CONSTRAINT chk_tareas_kanban_prioridad
        CHECK (prioridad IN ('baja', 'media', 'alta', 'critica'))
);

CREATE INDEX IF NOT EXISTS idx_tareas_kanban_proyecto
ON tareas_kanban(proyecto_id);

CREATE INDEX IF NOT EXISTS idx_tareas_kanban_columna_posicion
ON tareas_kanban(columna_id, posicion);

CREATE INDEX IF NOT EXISTS idx_tareas_kanban_responsable
ON tareas_kanban(responsable_id);


-- =====================================================
-- CREAR COLUMNAS INICIALES PARA PROYECTOS EXISTENTES
-- =====================================================

INSERT INTO columnas_kanban (proyecto_id, nombre, posicion, color)
SELECT p.id, 'Pendiente', 1, '#7B7BFF'
FROM proyectos p
WHERE NOT EXISTS (
    SELECT 1
    FROM columnas_kanban ck
    WHERE ck.proyecto_id = p.id
      AND ck.nombre = 'Pendiente'
);

INSERT INTO columnas_kanban (proyecto_id, nombre, posicion, color)
SELECT p.id, 'En progreso', 2, '#FACC15'
FROM proyectos p
WHERE NOT EXISTS (
    SELECT 1
    FROM columnas_kanban ck
    WHERE ck.proyecto_id = p.id
      AND ck.nombre = 'En progreso'
);

INSERT INTO columnas_kanban (proyecto_id, nombre, posicion, color)
SELECT p.id, 'En revisión', 3, '#38BDF8'
FROM proyectos p
WHERE NOT EXISTS (
    SELECT 1
    FROM columnas_kanban ck
    WHERE ck.proyecto_id = p.id
      AND ck.nombre = 'En revisión'
);

INSERT INTO columnas_kanban (proyecto_id, nombre, posicion, color)
SELECT p.id, 'Completado', 4, '#2FE6C8'
FROM proyectos p
WHERE NOT EXISTS (
    SELECT 1
    FROM columnas_kanban ck
    WHERE ck.proyecto_id = p.id
      AND ck.nombre = 'Completado'
);