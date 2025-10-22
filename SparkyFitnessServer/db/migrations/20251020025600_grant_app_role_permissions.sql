-- Grant usage on the public schema
GRANT USAGE ON SCHEMA public TO sparky_app;

-- Grant permissions on all tables in the public schema
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sparky_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sparky_app;

-- Grant permissions on all sequences in the public schema
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sparky_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO sparky_app;