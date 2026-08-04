import "server-only";

import { db } from "@/core/database/db";
import { platformAdmins } from "@/core/database/schema";
import { and, eq, isNull } from "drizzle-orm";

export async function getAuthenticatedHome(userId: string) {
  const [grant] = await db
    .select({ id: platformAdmins.id })
    .from(platformAdmins)
    .where(and(eq(platformAdmins.userId, userId), isNull(platformAdmins.revokedAt)))
    .limit(1);

  return grant ? "/superadmin" : "/dashboard";
}
