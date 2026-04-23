-- Add date columns to bl2
ALTER TABLE bl2
  ADD COLUMN IF NOT EXISTS line_start_date DATE,
  ADD COLUMN IF NOT EXISTS line_end_date DATE;

-- Create line_seasonality table for per-line, per-week season factors
CREATE TABLE IF NOT EXISTS line_seasonality (
  line_id    VARCHAR NOT NULL,
  year_week  VARCHAR NOT NULL,   -- format: "2026_W14" (ISO year + ISO week, no zero-padding)
  iso_year   INT     NOT NULL,
  iso_week   INT     NOT NULL,
  season     VARCHAR NOT NULL,   -- "XS" | "S" | "HS" | "L" | "XL"
  factor     DECIMAL(6,4) NOT NULL,
  PRIMARY KEY (line_id, year_week)
);

CREATE INDEX IF NOT EXISTS idx_line_seasonality_week ON line_seasonality (year_week);
CREATE INDEX IF NOT EXISTS idx_line_seasonality_line ON line_seasonality (line_id);

-- Disable RLS so API server can read/write freely
ALTER TABLE line_seasonality DISABLE ROW LEVEL SECURITY;
GRANT ALL ON line_seasonality TO anon;
GRANT ALL ON line_seasonality TO authenticated;
GRANT ALL ON line_seasonality TO service_role;
