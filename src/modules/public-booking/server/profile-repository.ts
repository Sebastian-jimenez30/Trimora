import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/core/database/db";
import { organizationPublicProfiles } from "@/core/database/schema";
import type {
  EnabledPublicOrganizationProfile,
  PublicOrganizationProfileReader,
} from "../domain/config";

export const publicOrganizationProfileRepository: PublicOrganizationProfileReader = {
  async findEnabledBySlug(slug): Promise<EnabledPublicOrganizationProfile | null> {
    const [profile] = await db
      .select({
        organizationId: organizationPublicProfiles.organizationId,
        slug: organizationPublicProfiles.slug,
        displayName: organizationPublicProfiles.displayName,
        timeZone: organizationPublicProfiles.timeZone,
        catalog: organizationPublicProfiles.publicCatalogEnabled,
        booking: organizationPublicProfiles.publicBookingEnabled,
        selfService: organizationPublicProfiles.publicSelfServiceEnabled,
        chat: organizationPublicProfiles.publicChatEnabled,
        reminders: organizationPublicProfiles.remindersEnabled,
      })
      .from(organizationPublicProfiles)
      .where(
        and(
          eq(organizationPublicProfiles.slug, slug),
          eq(organizationPublicProfiles.publicProfileEnabled, true),
        ),
      )
      .limit(1);

    if (!profile) return null;

    return {
      organizationId: profile.organizationId,
      slug: profile.slug,
      displayName: profile.displayName,
      timeZone: profile.timeZone,
      features: {
        catalog: profile.catalog,
        booking: profile.booking,
        selfService: profile.selfService,
        chat: profile.chat,
        reminders: profile.reminders,
      },
    };
  },
};
