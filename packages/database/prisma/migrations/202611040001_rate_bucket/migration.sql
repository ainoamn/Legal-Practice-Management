-- Shared request limits for deployments that do not run Redis.
-- This is operational metadata, not a tenant legal record.
CREATE TABLE "RateBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "RateBucket_pkey" PRIMARY KEY ("key")
);
GRANT SELECT, INSERT, UPDATE, DELETE ON "RateBucket" TO legal_app;
