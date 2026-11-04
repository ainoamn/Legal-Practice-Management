-- Link product users to BHD Identity subject (bhd_users.id).
ALTER TABLE "User" ADD COLUMN "bhdSub" UUID;
CREATE UNIQUE INDEX "User_bhdSub_key" ON "User"("bhdSub");
GRANT UPDATE ("bhdSub", "fullName", "email", "updatedAt") ON "User" TO legal_app;
