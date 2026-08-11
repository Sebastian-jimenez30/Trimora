import "server-only";

import { db } from "@/core/database/db";
import { platformAdmins } from "@/core/database/schema";
import { and, eq, isNull } from "drizzle-orm";

function hasPostgresErrorCode(error: unknown, expectedCode: string) {
  let current = error;
  const visited = new Set<unknown>();

  while (typeof current === "object" && current !== null && !visited.has(current)) {
    visited.add(current);

    if ("code" in current && current.code === expectedCode) {
      return true;
    }

    current = "cause" in current ? current.cause : null;
  }

  return false;
}

export async function getAuthenticatedHome(userId: string) {
  try {
    const [grant] = await db
      .select({ id: platformAdmins.id })
      .from(platformAdmins)
      .where(and(eq(platformAdmins.userId, userId), isNull(platformAdmins.revokedAt)))
      .limit(1);

    return grant ? "/superadmin" : "/dashboard";
  } catch (error) {
    if (!hasPostgresErrorCode(error, "42P01")) {
      throw error;
    }

    console.warn(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "warn",
        event: "platform_admin_schema_pending",
      }),
    );

    return "/dashboard";
  }
}
