export type PublicBookingFeatureFlags = Readonly<{
  catalog: boolean;
  booking: boolean;
  identity: boolean;
  selfService: boolean;
  chat: boolean;
  reminders: boolean;
}>;

export type EnabledPublicOrganizationProfile = Readonly<{
  organizationId: string;
  slug: string;
  displayName: string;
  timeZone: string;
  features: PublicBookingFeatureFlags;
}>;

export interface PublicOrganizationProfileReader {
  findEnabledBySlug(slug: string): Promise<EnabledPublicOrganizationProfile | null>;
}
