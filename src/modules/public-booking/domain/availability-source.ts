import type {
  AvailabilityBlock,
  AvailabilityPolicy,
  AvailableProfessional,
  BusyAppointment,
  WeeklyAvailabilityWindow,
} from "./availability";

export type PublicAvailabilitySource = Readonly<{
  timeZone: string;
  service: Readonly<{ id: string; name: string; durationMinutes: number }>;
  policy: AvailabilityPolicy;
  professionals: readonly AvailableProfessional[];
  windows: readonly WeeklyAvailabilityWindow[];
  blocks: readonly AvailabilityBlock[];
  appointments: readonly BusyAppointment[];
}>;

export interface PublicAvailabilityReader {
  findAvailabilitySource(input: {
    slug: string;
    serviceId: string;
    date: string;
  }): Promise<PublicAvailabilitySource | null>;
}
