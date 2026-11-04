#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=app_password="$APP_PASSWORD" --set=platform_password="$PLATFORM_PASSWORD" <<'SQL'
CREATE ROLE legal_app LOGIN PASSWORD :'app_password' NOSUPERUSER NOBYPASSRLS;
GRANT CONNECT ON DATABASE legal TO legal_app;
GRANT USAGE ON SCHEMA public TO legal_app;
CREATE ROLE legal_platform LOGIN PASSWORD :'platform_password' NOSUPERUSER NOBYPASSRLS;
GRANT CONNECT ON DATABASE legal TO legal_platform;
GRANT USAGE ON SCHEMA public TO legal_platform;
SQL
