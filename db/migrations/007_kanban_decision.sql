-- =====================================================
-- DevBrain - Migración 007
-- Liga las tareas del Kanban con la decisión que las originó.
-- Al crear una decisión se genera automáticamente una tarea en "Pendiente".
-- =====================================================

ALTER TABLE tareas_kanban
ADD COLUMN IF NOT EXISTS decision_id INTEGER;

-- Si la decisión se borra, su tarea asociada también.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_tareas_kanban_decision'
    ) THEN
        ALTER TABLE tareas_kanban
        ADD CONSTRAINT fk_tareas_kanban_decision
            FOREIGN KEY (decision_id)
            REFERENCES decisiones(id)
            ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tareas_kanban_decision
ON tareas_kanban(decision_id);
