/*
 DevBrain - Migración 006
 Campos extra en las decisiones.

 - fecha_cierre:  fecha límite de la votación. Cuando pasa, ya no se puede votar.
 - consecuencias: los trade-offs / lo que se sacrifica a sabiendas al tomar la
                  decisión (el campo estrella de un ADR).
 - reemplaza_a:   linaje de decisiones. Apunta a una decisión anterior que esta
                  reemplaza; la anterior queda marcada como obsoleta. Construye
                  la "memoria viva" del proyecto.
*/

ALTER TABLE decisiones
ADD COLUMN IF NOT EXISTS fecha_cierre TIMESTAMP,
ADD COLUMN IF NOT EXISTS consecuencias TEXT,
ADD COLUMN IF NOT EXISTS reemplaza_a INTEGER;

-- La decisión que se reemplaza vive en la misma tabla (auto-referencia).
-- Si la decisión anterior se borra, no perdemos la nueva: solo se limpia el enlace.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_decision_reemplaza'
    ) THEN
        ALTER TABLE decisiones
        ADD CONSTRAINT fk_decision_reemplaza
            FOREIGN KEY (reemplaza_a)
            REFERENCES decisiones(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_decision_reemplaza
ON decisiones(reemplaza_a);
