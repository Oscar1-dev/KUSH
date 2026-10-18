import { createDatabase, users, auditEvents } from "@kush/database";
import { hashPassword } from "./password.js";
const { DATABASE_URL, KUSH_ADMIN_EMAIL, KUSH_ADMIN_PASSWORD } = process.env;
if (!DATABASE_URL || !KUSH_ADMIN_EMAIL || !KUSH_ADMIN_PASSWORD)
  throw new Error(
    "Set DATABASE_URL, KUSH_ADMIN_EMAIL and KUSH_ADMIN_PASSWORD. No default credentials exist.",
  );
if (
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(KUSH_ADMIN_EMAIL) ||
  KUSH_ADMIN_PASSWORD.length < 14 ||
  KUSH_ADMIN_PASSWORD.length > 1024
)
  throw new Error("Use a valid email and a password of 14–1024 characters");
const { db, pool } = createDatabase(DATABASE_URL);
try {
  await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        email: KUSH_ADMIN_EMAIL.trim().toLowerCase(),
        passwordHash: await hashPassword(KUSH_ADMIN_PASSWORD),
        role: "admin",
      })
      .returning({ id: users.id });
    await tx
      .insert(auditEvents)
      .values({ actorId: user!.id, action: "admin.bootstrap" });
  });
  console.log(
    "Administrator created. Remove KUSH_ADMIN_PASSWORD from your environment.",
  );
} finally {
  await pool.end();
}
