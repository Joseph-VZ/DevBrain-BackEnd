/*
 DevBrain - Migración 003
 Comentarios / discusión en cada decisión.

 Permite que los miembros del proyecto debatan una decisión más allá del voto.
*/

CREATE TABLE IF NOT EXISTS comentarios_decision (

    id SERIAL PRIMARY KEY,

    decision_id INTEGER NOT NULL,

    usuario_id INTEGER NOT NULL,

    contenido TEXT NOT NULL,

    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_comentario_decision
        FOREIGN KEY (decision_id)
        REFERENCES decisiones(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_comentario_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES usuarios(id)
        ON DELETE CASCADE

);

CREATE INDEX IF NOT EXISTS idx_comentario_decision
ON comentarios_decision(decision_id);
