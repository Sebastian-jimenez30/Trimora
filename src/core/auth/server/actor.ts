import "server-only";

import { db } from "@/core/database/db";
import { organizationMembers, organizations, platformAdmins } from "@/core/database/schema";
import { createClient } from "@/core/database/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { hasAnyRole } from "../application/policies";
import { isOrganizationRole, type OrganizationRole } from "../domain/roles";
import type { ActorDto, PlatformActorDto } from "../interface/dto";

export class AuthorizationError extends Error {
  constructor(
    public readonly code: "UNAUTHENTICATED" | "NO_MEMBERSHIP" | "FORBIDDEN",
    message: string,
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

type ActorRequirements = {
  organizationId?: string;
  roles?: readonly OrganizationRole[];
};

async function requireAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new AuthorizationError("UNAUTHENTICATED", "No autenticado");
  return user;
}

function getDisplayName(user: Awaited<ReturnType<typeof requireAuthenticatedUser>>) {
  const metadataName = user.user_metadata?.full_name;
  return typeof metadataName === "string" && metadataName.trim()
    ? metadataName.trim()
    : user.email?.split("@")[0] || "Usuario";
}

export async function requireActor(requirements: ActorRequirements = {}): Promise<ActorDto> {
  const user = await requireAuthenticatedUser();
  const membershipFilter = requirements.organizationId
    ? and(
        eq(organizationMembers.userId, user.id),
        eq(organizationMembers.organizationId, requirements.organizationId),
      )
    : eq(organizationMembers.userId, user.id);

  const [membership] = await db
    .select({
      membershipId: organizationMembers.id,
      organizationId: organizationMembers.organizationId,
      organizationName: organizations.name,
      role: organizationMembers.role,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(membershipFilter)
    .orderBy(asc(organizationMembers.createdAt), asc(organizationMembers.id))
    .limit(1);

  if (!membership) {
    throw new AuthorizationError("NO_MEMBERSHIP", "No tienes una organización activa");
  }
  if (!isOrganizationRole(membership.role)) {
    throw new AuthorizationError("FORBIDDEN", "El rol de la membresía no es válido");
  }
  if (!hasAnyRole(membership.role, requirements.roles ?? [])) {
    throw new AuthorizationError("FORBIDDEN", "No tienes permisos para realizar esta acción");
  }

  const avatarUrl = user.user_metadata?.avatar_url;
  return Object.freeze({
    userId: user.id,
    email: user.email ?? null,
    displayName: getDisplayName(user),
    avatarUrl: typeof avatarUrl === "string" ? avatarUrl : null,
    membershipId: membership.membershipId,
    organizationId: membership.organizationId,
    organizationName: membership.organizationName,
    role: membership.role,
  });
}

export async function requirePlatformAdmin(): Promise<PlatformActorDto> {
  const user = await requireAuthenticatedUser();
  const [grant] = await db
    .select({ id: platformAdmins.id })
    .from(platformAdmins)
    .where(and(eq(platformAdmins.userId, user.id), isNull(platformAdmins.revokedAt)))
    .limit(1);

  if (!grant) throw new AuthorizationError("FORBIDDEN", "Acceso de plataforma denegado");

  return Object.freeze({
    userId: user.id,
    email: user.email ?? null,
    displayName: getDisplayName(user),
    grantId: grant.id,
  });
}
