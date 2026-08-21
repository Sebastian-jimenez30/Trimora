import { randomUUID } from "node:crypto";
import type { CustomerSessionDto, PublicIdentityChallengeDto } from "../interface/dto";
import { normalizeContact } from "../domain/contact";
import {
  publicIdentityRequestSchema,
  publicIdentityVerificationSchema,
  publicOrganizationSlugSchema,
} from "../domain/schemas";
import { createPublicAuthClient } from "../server/public-auth-client";
import {
  beginVerificationAttempt,
  createIdentityChallenge,
  findIdentityOrganization,
  IdentityConflictError,
  linkVerifiedCustomer,
  registerIdentityEvent,
} from "../server/identity-repository";
import { identityFingerprint, isPhoneOtpEnabled } from "../server/identity-security";

const NEUTRAL_MESSAGE =
  "Si los datos son válidos, recibirás un código para continuar. Revisa también correo no deseado.";

export type IdentityOperationResult<T> =
  | Readonly<{ success: true; data: T }>
  | Readonly<{ success: false; code: "INVALID" | "UNAVAILABLE" | "VERIFICATION_FAILED" }>;

export async function requestCustomerIdentity(
  rawSlug: unknown,
  rawInput: unknown,
  ipHash: string | null,
  now = new Date(),
): Promise<IdentityOperationResult<PublicIdentityChallengeDto>> {
  const slug = publicOrganizationSlugSchema.safeParse(rawSlug);
  const input = publicIdentityRequestSchema.safeParse(rawInput);
  if (!slug.success || !input.success) return { success: false, code: "INVALID" };

  const contact = normalizeContact(input.data.channel, input.data.contact);
  if (!contact) return { success: false, code: "INVALID" };
  if (contact.channel === "PHONE" && !isPhoneOtpEnabled()) {
    return { success: false, code: "UNAVAILABLE" };
  }
  const organization = await findIdentityOrganization(slug.data);
  if (!organization) return { success: false, code: "UNAVAILABLE" };

  const contactHash = identityFingerprint(`contact:${contact.channel}:${contact.value}`);
  const challenge = await createIdentityChallenge({
    organizationId: organization.organizationId,
    channel: contact.channel,
    contactHash,
    ipHash,
    now,
  });
  const challengeId = challenge?.id ?? randomUUID();

  if (challenge) {
    const supabase = await createPublicAuthClient();
    let providerRejected = false;
    try {
      const response =
        contact.channel === "EMAIL"
          ? await supabase.auth.signInWithOtp({
              email: contact.value,
              options: { shouldCreateUser: true },
            })
          : await supabase.auth.signInWithOtp({
              phone: contact.value,
              options: { shouldCreateUser: true },
            });
      providerRejected = Boolean(response.error);
    } catch {
      providerRejected = true;
    }
    await registerIdentityEvent({
      organizationId: organization.organizationId,
      challengeId: challenge.id,
      eventType: "OTP_REQUESTED",
      outcome: providerRejected ? "REJECTED" : "ACCEPTED",
    });
  }

  return { success: true, data: { challengeId, message: NEUTRAL_MESSAGE } };
}

export async function verifyCustomerIdentity(
  rawSlug: unknown,
  rawInput: unknown,
  now = new Date(),
): Promise<IdentityOperationResult<CustomerSessionDto>> {
  const slug = publicOrganizationSlugSchema.safeParse(rawSlug);
  const input = publicIdentityVerificationSchema.safeParse(rawInput);
  if (!slug.success || !input.success) return { success: false, code: "INVALID" };

  const contact = normalizeContact(input.data.channel, input.data.contact);
  if (!contact) return { success: false, code: "INVALID" };
  if (contact.channel === "PHONE" && !isPhoneOtpEnabled()) {
    return { success: false, code: "UNAVAILABLE" };
  }
  const organization = await findIdentityOrganization(slug.data);
  if (!organization) return { success: false, code: "UNAVAILABLE" };

  const contactHash = identityFingerprint(`contact:${contact.channel}:${contact.value}`);
  const attempt = await beginVerificationAttempt({
    challengeId: input.data.challengeId,
    organizationId: organization.organizationId,
    channel: contact.channel,
    contactHash,
    now,
  });
  if (!attempt.accepted) {
    await registerIdentityEvent({
      organizationId: organization.organizationId,
      ...(attempt.challengeId ? { challengeId: attempt.challengeId } : {}),
      eventType: "OTP_VERIFIED",
      outcome: attempt.outcome,
    });
    return { success: false, code: "VERIFICATION_FAILED" };
  }

  const supabase = await createPublicAuthClient();
  let verifiedUser: { id: string } | null = null;
  try {
    const response =
      contact.channel === "EMAIL"
        ? await supabase.auth.verifyOtp({
            email: contact.value,
            token: input.data.token,
            type: "email",
          })
        : await supabase.auth.verifyOtp({
            phone: contact.value,
            token: input.data.token,
            type: "sms",
          });
    if (!response.error && response.data.user) verifiedUser = response.data.user;
  } catch {
    verifiedUser = null;
  }
  if (!verifiedUser) {
    await registerIdentityEvent({
      organizationId: organization.organizationId,
      challengeId: input.data.challengeId,
      eventType: "OTP_VERIFIED",
      outcome: "REJECTED",
    });
    return { success: false, code: "VERIFICATION_FAILED" };
  }

  try {
    await linkVerifiedCustomer({
      organizationId: organization.organizationId,
      challengeId: input.data.challengeId,
      authUserId: verifiedUser.id,
      contact,
      contactHash,
      name: input.data.name,
      now,
    });
  } catch (error) {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // The identity flag and actor lookup still prevent access without a valid link.
    }
    await registerIdentityEvent({
      organizationId: organization.organizationId,
      challengeId: input.data.challengeId,
      authUserId: verifiedUser.id,
      eventType: "OTP_VERIFIED",
      outcome: error instanceof IdentityConflictError ? "CONFLICT" : "REJECTED",
    });
    return { success: false, code: "VERIFICATION_FAILED" };
  }

  return {
    success: true,
    data: { authenticated: true, customer: { displayName: input.data.name.trim() } },
  };
}
