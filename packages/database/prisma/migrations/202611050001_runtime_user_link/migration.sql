-- The runtime role is NOSUPERUSER NOBYPASSRLS. Column updates were granted to
-- legal_app only, so linking an existing office account to BHD failed at runtime.
GRANT UPDATE ("bhdSub", "fullName", "email", "passwordHash", "updatedAt") ON "User" TO legal_runtime;
