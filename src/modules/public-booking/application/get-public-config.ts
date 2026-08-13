import type { PublicOrganizationProfileReader } from "../domain/config";
import { publicOrganizationSlugSchema } from "../domain/schemas";
import type { PublicBookingConfigDto } from "../interface/dto";

export async function getPublicBookingConfig(
  profileReader: PublicOrganizationProfileReader,
  rawSlug: string,
): Promise<PublicBookingConfigDto | null> {
  const parsedSlug = publicOrganizationSlugSchema.safeParse(rawSlug);
  if (!parsedSlug.success) return null;

  const profile = await profileReader.findEnabledBySlug(parsedSlug.data);
  if (!profile) return null;

  return Object.freeze({
    organization: Object.freeze({
      slug: profile.slug,
      displayName: profile.displayName,
      timeZone: profile.timeZone,
    }),
    features: Object.freeze({ ...profile.features }),
  });
}
