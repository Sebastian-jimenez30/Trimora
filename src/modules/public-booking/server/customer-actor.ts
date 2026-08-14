import "server-only";

import { publicOrganizationSlugSchema } from "../domain/schemas";
import { createPublicAuthClient } from "./public-auth-client";
import { findCustomerActor, findIdentityOrganization } from "./identity-repository";

export class CustomerAuthorizationError extends Error {
  constructor(public readonly code: "UNAUTHENTICATED" | "UNAVAILABLE" | "CONFLICT") {
    super("Sesión de cliente no disponible");
    this.name = "CustomerAuthorizationError";
  }
}

export async function requireCustomerActor(rawSlug: unknown) {
  const parsedSlug = publicOrganizationSlugSchema.safeParse(rawSlug);
  if (!parsedSlug.success) throw new CustomerAuthorizationError("UNAVAILABLE");

  const organization = await findIdentityOrganization(parsedSlug.data);
  if (!organization) throw new CustomerAuthorizationError("UNAVAILABLE");

  const supabase = await createPublicAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new CustomerAuthorizationError("UNAUTHENTICATED");

  const identity = await findCustomerActor(organization.organizationId, user.id);
  if (!identity) throw new CustomerAuthorizationError("CONFLICT");

  return Object.freeze({
    authUserId: user.id,
    organizationId: organization.organizationId,
    organizationDisplayName: organization.displayName,
    identityId: identity.identityId,
    clientId: identity.clientId,
    displayName: [identity.firstName, identity.lastName].filter(Boolean).join(" "),
  });
}
