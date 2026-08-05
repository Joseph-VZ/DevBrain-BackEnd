/*
 DevBrain - Migración 004
 Historial de conversaciones con la IA.

 Guarda las preguntas y respuestas generadas por Gemini
 para que futuras consultas puedan utilizar el historial
 del proyecto como contexto adicional.
*/

CREATE TABLE IF NOT EXISTS ai_conversations (

    id SERIAL PRIMARY KEY,

    proyecto_id INTEGER NOT NULL,

    usuario_id INTEGER NOT NULL,

    pregunta TEXT NOT NULL,

    respuesta TEXT NOT NULL,

    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_ai_proyecto
        FOREIGN KEY (proyecto_id)
        REFERENCES proyectos(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_ai_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES usuarios(id)
        ON DELETE CASCADE

);

CREATE INDEX IF NOT EXISTS idx_ai_proyecto
ON ai_conversations(proyecto_id);

CREATE INDEX IF NOT EXISTS idx_ai_usuario
ON ai_conversations(usuario_id);

CREATE INDEX IF NOT EXISTS idx_ai_fecha
ON ai_conversations(fecha_creacion);