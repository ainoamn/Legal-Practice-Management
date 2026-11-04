ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_tenantId_userId_fkey"
FOREIGN KEY ("tenantId","userId") REFERENCES "Membership"("tenantId","userId") ON DELETE RESTRICT;
