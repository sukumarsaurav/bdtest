DO $$
DECLARE
    tables text[] := ARRAY[
        'bp_cost_actuals', 
        'sheet_snapshots', 
        'bd_actions', 
        'bl_summary', 
        'targets', 
        'analytics_targets', 
        'renegotiations', 
        'line_seasonality', 
        'action_comments'
    ];
    t text;
BEGIN
    FOREACH t IN ARRAY tables
    LOOP
        IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
            EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
            EXECUTE format('DROP POLICY IF EXISTS "Allow authenticated full access" ON %I;', t);
            EXECUTE format('CREATE POLICY "Allow authenticated full access" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true);', t);
        END IF;
    END LOOP;
END;
$$;

DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'line_seasonality') THEN
        REVOKE ALL ON line_seasonality FROM anon;
    END IF;
END;
$$;
