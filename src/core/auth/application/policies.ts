import type { OrganizationRole } from "../domain/roles";

export function hasAnyRole(actorRole: OrganizationRole, allowedRoles: readonly OrganizationRole[]) {
  return allowedRoles.length === 0 || allowedRoles.includes(actorRole);
}

export function canManageOrganization(role: OrganizationRole) {
  return role === "ADMIN";
}
