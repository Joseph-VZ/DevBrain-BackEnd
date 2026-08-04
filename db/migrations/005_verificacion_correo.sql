/*
 DevBrain - Migración 004
 Verificación de correo electrónico.
*/

ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS correo_verificado BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS token_verificacion VARCHAR(128),
ADD COLUMN IF NOT EXISTS token_verificacion_expira TIMESTAMP;

-- Las cuentas creadas antes de esta migración se consideran verificadas.
UPDATE usuarios
SET correo_verificado = TRUE
WHERE token_verificacion IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_usuario_token_verificacion
ON usuarios(token_verificacion)
WHERE token_verificacion IS NOT NULL;