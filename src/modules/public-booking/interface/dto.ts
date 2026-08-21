import type { EnabledPublicOrganizationProfile } from "../domain/config";

export type PublicBookingConfigDto = Readonly<{
  organization: Readonly<{
    slug: string;
    displayName: string;
    timeZone: string;
  }>;
  features: EnabledPublicOrganizationProfile["features"];
}>;

export type PublicAvailabilitySlotDto = Readonly<{
  startsAt: string;
  endsAt: string;
  availableStaffCount: number;
}>;

export type PublicAvailabilityDto = Readonly<{
  date: string;
  timeZone: string;
  service: Readonly<{
    id: string;
    name: string;
    durationMinutes: number;
  }>;
  slots: readonly PublicAvailabilitySlotDto[];
}>;

export type PublicIdentityChallengeDto = Readonly<{
  challengeId: string;
  message: string;
}>;

export type CustomerSessionDto = Readonly<{
  authenticated: true;
  customer: Readonly<{
    displayName: string;
  }>;
}>;
