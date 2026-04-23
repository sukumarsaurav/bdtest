-- Renegotiation pipeline redesign: 7-stage status machine + approval gate

-- Add new columns
ALTER TABLE renegotiations
  ADD COLUMN IF NOT EXISTS old_gst_slab     INT,
  ADD COLUMN IF NOT EXISTS new_gst_slab     INT,
  ADD COLUMN IF NOT EXISTS input_mode       VARCHAR DEFAULT 'pct',
  ADD COLUMN IF NOT EXISTS affected_buses   INT,
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS status_history   JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS approved_by      VARCHAR,
  ADD COLUMN IF NOT EXISTS approved_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_note    TEXT;

-- Update status constraint to include pending_approval
ALTER TABLE renegotiations DROP CONSTRAINT IF EXISTS renegotiations_status_check;
ALTER TABLE renegotiations ADD CONSTRAINT renegotiations_status_check
  CHECK (status IN ('identified','proposed','pitched','in_discussion','agreed','pending_approval','effective','rejected','route_change'));

-- Backfill old_min_g and old_gst_slab from bl2
UPDATE renegotiations r
SET old_min_g = b.min_g,
    old_gst_slab = b.gst_slab
FROM bl2 b
WHERE r.line_id = b.line_id
  AND r.old_min_g IS NULL;

-- Ensure old_min_g is populated for all records
UPDATE renegotiations
SET old_min_g = current_min_g
WHERE old_min_g IS NULL AND current_min_g IS NOT NULL;
