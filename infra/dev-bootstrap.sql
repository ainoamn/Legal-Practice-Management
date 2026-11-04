-- DEVELOPMENT ONLY. Run on a fresh local PostgreSQL cluster as its administrator.
CREATE ROLE legal_owner LOGIN PASSWORD 'legal_dev_owner' NOSUPERUSER BYPASSRLS CREATEDB;
CREATE ROLE legal_app LOGIN PASSWORD 'legal_dev_app' NOSUPERUSER NOBYPASSRLS;
CREATE ROLE legal_platform LOGIN PASSWORD 'legal_dev_platform' NOSUPERUSER NOBYPASSRLS;
CREATE DATABASE legal OWNER legal_owner;
\connect legal
GRANT USAGE ON SCHEMA public TO legal_app;
