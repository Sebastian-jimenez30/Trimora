export const ORGANIZATION_ROLES = ["ADMIN", "BARBER", "RECEPTIONIST"] as const;

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export function isOrganizationRole(value: string): value is OrganizationRole {
  return ORGANIZATION_ROLES.includes(value as OrganizationRole);
}
