CREATE UNIQUE INDEX "Tenant_id_slug_key" ON "Tenant" (id,slug);
ALTER TABLE "OfficeDirectory" DROP CONSTRAINT "OfficeDirectory_tenantId_fkey";
ALTER TABLE "OfficeDirectory" ADD CONSTRAINT "OfficeDirectory_tenantId_slug_fkey"
FOREIGN KEY ("tenantId",slug) REFERENCES "Tenant"(id,slug) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Membership_tenantId_id_userId_key" ON "Membership" ("tenantId",id,"userId");
ALTER TABLE "Session" DROP CONSTRAINT "Session_tenantId_membershipId_fkey";
ALTER TABLE "Session" ADD CONSTRAINT "Session_tenantId_membershipId_userId_fkey"
FOREIGN KEY ("tenantId","membershipId","userId") REFERENCES "Membership"("tenantId",id,"userId") ON DELETE RESTRICT ON UPDATE CASCADE;
