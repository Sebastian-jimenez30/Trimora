import type { OrganizationRole } from "../domain/roles";

export type ActorDto = Readonly<{
  userId: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  membershipId: string;
  organizationId: string;
  organizationName: string;
  role: OrganizationRole;
}>;

export type PlatformActorDto = Readonly<{
  userId: string;
  email: string | null;
  displayName: string;
  grantId: string;
}>;
