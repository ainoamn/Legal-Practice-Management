import {
  platformDatabase,
  assertSafePlatformDatabase,
} from "../packages/database/src/index.js";
import {
  adminCreateSchema,
  platformPermissions,
} from "../packages/contracts/src/platform.js";
import { hashPassword } from "../apps/api/src/auth/password.js";
let input = "";
for await (const chunk of process.stdin) input += chunk;
const data = adminCreateSchema.parse({
  ...JSON.parse(input),
  permissions: [...platformPermissions],
});
await assertSafePlatformDatabase();
const p = platformDatabase(),
  passwordHash = await hashPassword(data.password);
try {
  await p.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('platform-bootstrap',0))`;
    if (await tx.platformAdmin.count({ where: { kind: "OWNER" } }))
      throw new Error(
        "A platform owner already exists. Bootstrap cannot replace it.",
      );
    const owner = await tx.platformAdmin.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash,
        kind: "OWNER",
        permissions: [...platformPermissions],
      },
    });
    await tx.platformAudit.create({
      data: {
        adminId: owner.id,
        action: "admin.owner.bootstrapped",
        targetId: owner.id,
      },
    });
  });
  process.stdout.write(
    "Platform owner created. Open http://localhost:4310/admin and enroll your authenticator before accessing administration.\n",
  );
} finally {
  data.password = "";
  await p.$disconnect();
}
