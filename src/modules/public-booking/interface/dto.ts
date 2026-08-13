import type { EnabledPublicOrganizationProfile } from "../domain/config";

export type PublicBookingConfigDto = Readonly<{
  organization: Readonly<{
    slug: string;
    displayName: string;
    timeZone: string;
  }>;
  features: EnabledPublicOrganizationProfile["features"];
}>;
