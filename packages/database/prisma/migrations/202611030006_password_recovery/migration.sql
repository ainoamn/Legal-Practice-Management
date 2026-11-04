CREATE TABLE "PasswordReset" (
  id UUID PRIMARY KEY,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  "tenantId" UUID NOT NULL REFERENCES "Tenant"(id) ON DELETE RESTRICT,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "usedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PasswordReset_userId_expiresAt_idx" ON "PasswordReset" ("userId","expiresAt");
GRANT SELECT, INSERT, UPDATE ON "PasswordReset" TO legal_app;
GRANT UPDATE ("passwordHash","updatedAt") ON "User" TO legal_app;
