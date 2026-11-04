CREATE TABLE "MFAConfiguration" (
  "userId" UUID PRIMARY KEY REFERENCES "User"(id) ON DELETE RESTRICT,
  enabled BOOLEAN NOT NULL DEFAULT false,
  "encryptedSecret" TEXT,
  "pendingSecret" TEXT,
  "pendingExpiresAt" TIMESTAMPTZ,
  "lastCounter" BIGINT NOT NULL DEFAULT -1,
  "recoveryHashes" TEXT[] NOT NULL DEFAULT '{}',
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT mfa_enabled_requires_secret CHECK (NOT enabled OR "encryptedSecret" IS NOT NULL)
);
GRANT SELECT, INSERT, UPDATE ON "MFAConfiguration" TO legal_app;
