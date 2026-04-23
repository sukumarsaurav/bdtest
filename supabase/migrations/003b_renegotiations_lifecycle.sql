-- Run AFTER 003_renegotiations.sql if the table already exists.
-- Adds lifecycle columns for the 5-stage pipeline.

-- Expand status check to include new stages
ALTER TABLE renegotiations DROP CONSTRAINT IF EXISTS renegotiations_status_check;
ALTER TABLE renegotiations ADD CONSTRAINT renegotiations_status_check
  CHECK (status IN ('identified','pitched','in_discussion','accepted','rejected','route_change','effective'));

-- Add lifecycle timestamps
ALTER TABLE renegotiations ADD COLUMN IF NOT EXISTS pitched_at timestamptz;
ALTER TABLE renegotiations ADD COLUMN IF NOT EXISTS discussion_started_at timestamptz;
ALTER TABLE renegotiations ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

-- Rate change tracking
ALTER TABLE renegotiations ADD COLUMN IF NOT EXISTS old_ming numeric;
ALTER TABLE renegotiations ADD COLUMN IF NOT EXISTS new_ming numeric;
ALTER TABLE renegotiations ADD COLUMN IF NOT EXISTS effective_date date;

-- Rejection / route change
ALTER TABLE renegotiations ADD COLUMN IF NOT EXISTS rejected_reason text;
ALTER TABLE renegotiations ADD COLUMN IF NOT EXISTS new_route_line_id text;
ALTER TABLE renegotiations ADD COLUMN IF NOT EXISTS pitched_by text;

-- Backfill old_ming from current_min_g for existing rows
UPDATE renegotiations SET old_ming = current_min_g WHERE old_ming IS NULL;
