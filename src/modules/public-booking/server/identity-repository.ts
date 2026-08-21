import "server-only";

import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db } from "@/core/database/db";
import {
  clients,
  customerIdentities,
  organizationPublicProfiles,
  publicIdentityChallenges,
  publicIdentityEvents,
} from "@/core/database/schema";
import type { NormalizedContact, PublicContactChannel } from "../domain/contact";
import { splitCustomerName } from "../domain/contact";

const REQUEST_WINDOW_MS = 15 * 60_000;
const CHALLENGE_LIFETIME_MS = 10 * 60_000;
const MAX_CONTACT_REQUESTS = 3;
const MAX_IP_REQUESTS = 10;
const MAX_VERIFY_ATTEMPTS = 5;

export class IdentityConflictError extends Error {
  constructor() {
    super("La identidad requiere revisión administrativa");
    this.name = "IdentityConflictError";
  }
}

export async function findIdentityOrganization(slug: string) {
  const [profile] = await db
    .select({
      organizationId: organizationPublicProfiles.organizationId,
      displayName: organizationPublicProfiles.displayName,
    })
    .from(organizationPublicProfiles)
    .where(
      and(
        eq(organizationPublicProfiles.slug, slug),
        eq(organizationPublicProfiles.publicProfileEnabled, true),
        eq(organizationPublicProfiles.publicIdentityEnabled, true),
      ),
    )
    .limit(1);
  return profile ?? null;
}

export async function createIdentityChallenge(input: {
  organizationId: string;
  channel: PublicContactChannel;
  contactHash: string;
  ipHash: string | null;
  now: Date;
}) {
  return db.transaction(async (tx) => {
    const contactLock = `${input.organizationId}:${input.contactHash}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${contactLock}, 0))`);
    if (input.ipHash) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.ipHash}, 2))`);
    }
    const since = new Date(input.now.getTime() - REQUEST_WINDOW_MS);
    const [contactCount] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(publicIdentityChallenges)
      .where(
        and(
          eq(publicIdentityChallenges.organizationId, input.organizationId),
          eq(publicIdentityChallenges.contactHash, input.contactHash),
          gt(publicIdentityChallenges.createdAt, since),
        ),
      );
    const [ipCount] = input.ipHash
      ? await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(publicIdentityChallenges)
          .where(
            and(
              eq(publicIdentityChallenges.ipHash, input.ipHash),
              gt(publicIdentityChallenges.createdAt, since),
            ),
          )
      : [{ count: 0 }];

    if (
      (contactCount?.count ?? 0) >= MAX_CONTACT_REQUESTS ||
      (ipCount?.count ?? 0) >= MAX_IP_REQUESTS
    ) {
      return null;
    }

    const [challenge] = await tx
      .insert(publicIdentityChallenges)
      .values({
        organizationId: input.organizationId,
        channel: input.channel,
        contactHash: input.contactHash,
        ipHash: input.ipHash,
        expiresAt: new Date(input.now.getTime() + CHALLENGE_LIFETIME_MS),
      })
      .returning({ id: publicIdentityChallenges.id });
    return challenge;
  });
}

export async function registerIdentityEvent(input: {
  organizationId: string;
  challengeId?: string;
  identityId?: string;
  authUserId?: string;
  eventType: "OTP_REQUESTED" | "OTP_VERIFIED" | "SESSION_CLOSED";
  outcome: "ACCEPTED" | "REJECTED" | "RATE_LIMITED" | "EXPIRED" | "CONFLICT";
}) {
  await db.insert(publicIdentityEvents).values(input);
}

type VerificationAttemptResult =
  | Readonly<{ accepted: true; outcome: "ACCEPTED"; challengeId: string }>
  | Readonly<{
      accepted: false;
      outcome: "REJECTED" | "EXPIRED";
      challengeId?: string;
    }>;

export async function beginVerificationAttempt(input: {
  challengeId: string;
  organizationId: string;
  channel: PublicContactChannel;
  contactHash: string;
  now: Date;
}): Promise<VerificationAttemptResult> {
  return db.transaction(async (tx) => {
    const [challenge] = await tx
      .select({
        id: publicIdentityChallenges.id,
        attemptCount: publicIdentityChallenges.attemptCount,
        expiresAt: publicIdentityChallenges.expiresAt,
        consumedAt: publicIdentityChallenges.consumedAt,
      })
      .from(publicIdentityChallenges)
      .where(
        and(
          eq(publicIdentityChallenges.id, input.challengeId),
          eq(publicIdentityChallenges.organizationId, input.organizationId),
          eq(publicIdentityChallenges.channel, input.channel),
          eq(publicIdentityChallenges.contactHash, input.contactHash),
        ),
      )
      .limit(1)
      .for("update");
    if (!challenge) {
      return { accepted: false, outcome: "REJECTED" };
    }
    if (challenge.consumedAt || challenge.attemptCount >= MAX_VERIFY_ATTEMPTS) {
      return { accepted: false, outcome: "REJECTED", challengeId: challenge.id };
    }
    if (challenge.expiresAt <= input.now) {
      return { accepted: false, outcome: "EXPIRED", challengeId: challenge.id };
    }
    await tx
      .update(publicIdentityChallenges)
      .set({ attemptCount: challenge.attemptCount + 1 })
      .where(eq(publicIdentityChallenges.id, input.challengeId));
    return { accepted: true, outcome: "ACCEPTED", challengeId: challenge.id };
  });
}

function legacyContactFilter(contact: NormalizedContact) {
  if (contact.channel === "EMAIL") {
    return sql`lower(btrim(${clients.email})) = ${contact.value}`;
  }
  const digits = contact.value.replace(/\D/gu, "");
  const localDigits = digits.startsWith("57") && digits.length === 12 ? digits.slice(2) : digits;
  return or(
    sql`regexp_replace(coalesce(${clients.phone}, ''), '[^0-9]', '', 'g') = ${digits}`,
    sql`regexp_replace(coalesce(${clients.phone}, ''), '[^0-9]', '', 'g') = ${localDigits}`,
  );
}

export async function linkVerifiedCustomer(input: {
  organizationId: string;
  challengeId: string;
  authUserId: string;
  contact: NormalizedContact;
  contactHash: string;
  name: string;
  now: Date;
}) {
  return db.transaction(async (tx) => {
    const identityLock = `${input.organizationId}:${input.contactHash}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${identityLock}, 1))`);
    const contactIdentities = await tx
      .select()
      .from(customerIdentities)
      .where(
        and(
          eq(customerIdentities.organizationId, input.organizationId),
          eq(customerIdentities.channel, input.contact.channel),
          eq(customerIdentities.contactHash, input.contactHash),
          isNull(customerIdentities.revokedAt),
        ),
      )
      .limit(2);
    if (
      contactIdentities.length > 1 ||
      (contactIdentities[0] && contactIdentities[0].authUserId !== input.authUserId)
    ) {
      throw new IdentityConflictError();
    }

    const userIdentities = await tx
      .select({ clientId: customerIdentities.clientId })
      .from(customerIdentities)
      .where(
        and(
          eq(customerIdentities.organizationId, input.organizationId),
          eq(customerIdentities.authUserId, input.authUserId),
          isNull(customerIdentities.revokedAt),
        ),
      );
    const userClientIds = [...new Set(userIdentities.map((identity) => identity.clientId))];
    if (userClientIds.length > 1) throw new IdentityConflictError();

    const matchingClients = await tx
      .select({ id: clients.id })
      .from(clients)
      .where(
        and(eq(clients.organizationId, input.organizationId), legacyContactFilter(input.contact)),
      )
      .orderBy(desc(clients.createdAt), desc(clients.id))
      .limit(2);
    if (matchingClients.length > 1) throw new IdentityConflictError();

    const knownClientId = contactIdentities[0]?.clientId ?? userClientIds[0];
    if (knownClientId && matchingClients[0] && knownClientId !== matchingClients[0].id) {
      throw new IdentityConflictError();
    }

    let clientId = knownClientId ?? matchingClients[0]?.id;
    if (!clientId) {
      const name = splitCustomerName(input.name);
      const [createdClient] = await tx
        .insert(clients)
        .values({
          organizationId: input.organizationId,
          firstName: name.firstName,
          lastName: name.lastName,
          email: input.contact.channel === "EMAIL" ? input.contact.value : null,
          phone: input.contact.channel === "PHONE" ? input.contact.value : null,
        })
        .returning({ id: clients.id });
      clientId = createdClient.id;
    }

    let identity = contactIdentities[0];
    if (identity) {
      [identity] = await tx
        .update(customerIdentities)
        .set({ lastAuthenticatedAt: input.now, updatedAt: input.now })
        .where(eq(customerIdentities.id, identity.id))
        .returning();
    } else {
      [identity] = await tx
        .insert(customerIdentities)
        .values({
          organizationId: input.organizationId,
          clientId,
          authUserId: input.authUserId,
          channel: input.contact.channel,
          contactHash: input.contactHash,
          verifiedAt: input.now,
          lastAuthenticatedAt: input.now,
        })
        .returning();
    }

    await tx
      .update(publicIdentityChallenges)
      .set({ consumedAt: input.now })
      .where(eq(publicIdentityChallenges.id, input.challengeId));
    await tx.insert(publicIdentityEvents).values({
      organizationId: input.organizationId,
      challengeId: input.challengeId,
      identityId: identity.id,
      authUserId: input.authUserId,
      eventType: "OTP_VERIFIED",
      outcome: "ACCEPTED",
    });
    return identity;
  });
}

export async function findCustomerActor(organizationId: string, authUserId: string) {
  const rows = await db
    .select({
      identityId: customerIdentities.id,
      clientId: customerIdentities.clientId,
      firstName: clients.firstName,
      lastName: clients.lastName,
    })
    .from(customerIdentities)
    .innerJoin(
      clients,
      and(
        eq(clients.id, customerIdentities.clientId),
        eq(clients.organizationId, customerIdentities.organizationId),
      ),
    )
    .where(
      and(
        eq(customerIdentities.organizationId, organizationId),
        eq(customerIdentities.authUserId, authUserId),
        isNull(customerIdentities.revokedAt),
      ),
    )
    .limit(2);
  const clientIds = [...new Set(rows.map((row) => row.clientId))];
  if (clientIds.length !== 1 || !rows[0]) return null;
  return rows[0];
}
