import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export type WeeklyAvailabilityWindow = Readonly<{
  staffId: string | null;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}>;

export type AvailabilityBlock = Readonly<{
  staffId: string | null;
  startsAt: Date;
  endsAt: Date;
}>;

export type BusyAppointment = Readonly<{
  staffId: string;
  startsAt: Date;
  endsAt: Date;
}>;

export type AvailableProfessional = Readonly<{ id: string }>;

export type AvailabilityPolicy = Readonly<{
  minimumNoticeMinutes: number;
  maximumAdvanceDays: number;
  slotIntervalMinutes: number;
  bufferMinutes: number;
}>;

export type AvailabilitySlot = Readonly<{
  startsAt: Date;
  endsAt: Date;
  staffIds: readonly string[];
}>;

export type AvailabilityInput = Readonly<{
  date: string;
  timeZone: string;
  durationMinutes: number;
  policy: AvailabilityPolicy;
  professionals: readonly AvailableProfessional[];
  windows: readonly WeeklyAvailabilityWindow[];
  blocks: readonly AvailabilityBlock[];
  appointments: readonly BusyAppointment[];
  now?: Date;
}>;

type TimeRange = Readonly<{ startsAt: Date; endsAt: Date }>;

const MINUTE_MS = 60_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function isoDayOfWeek(date: string) {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function localDateTime(date: string, minute: number, timeZone: string) {
  const hours = String(Math.floor(minute / 60)).padStart(2, "0");
  const minutes = String(minute % 60).padStart(2, "0");
  const localValue = `${date}T${hours}:${minutes}`;
  const instant = fromZonedTime(localValue, timeZone);

  // A nonexistent local time during a DST jump must never become a bookable slot.
  return formatInTimeZone(instant, timeZone, "yyyy-MM-dd'T'HH:mm") === localValue ? instant : null;
}

function expandWindow(
  window: WeeklyAvailabilityWindow,
  anchorDate: string,
  timeZone: string,
): TimeRange | null {
  const startsAt = localDateTime(anchorDate, window.startMinute, timeZone);
  const endDate = window.endMinute <= window.startMinute ? shiftDate(anchorDate, 1) : anchorDate;
  const endsAt = localDateTime(endDate, window.endMinute, timeZone);
  if (!startsAt || !endsAt || endsAt <= startsAt) return null;
  return { startsAt, endsAt };
}

function rangesForDate(
  windows: readonly WeeklyAvailabilityWindow[],
  date: string,
  timeZone: string,
) {
  const anchors = [shiftDate(date, -1), date];
  return anchors.flatMap((anchorDate) => {
    const dayOfWeek = isoDayOfWeek(anchorDate);
    return windows
      .filter((window) => window.dayOfWeek === dayOfWeek)
      .map((window) => expandWindow(window, anchorDate, timeZone))
      .filter((range): range is TimeRange => range !== null);
  });
}

function intersectRanges(left: readonly TimeRange[], right: readonly TimeRange[]) {
  return left.flatMap((leftRange) =>
    right.flatMap((rightRange) => {
      const startsAt = new Date(
        Math.max(leftRange.startsAt.getTime(), rightRange.startsAt.getTime()),
      );
      const endsAt = new Date(Math.min(leftRange.endsAt.getTime(), rightRange.endsAt.getTime()));
      return startsAt < endsAt ? [{ startsAt, endsAt }] : [];
    }),
  );
}

function overlaps(left: TimeRange, right: TimeRange) {
  return left.startsAt < right.endsAt && right.startsAt < left.endsAt;
}

function isValidDate(date: string) {
  if (!DATE_PATTERN.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function calculateAvailability(input: AvailabilityInput): readonly AvailabilitySlot[] {
  if (!isValidDate(input.date) || input.durationMinutes <= 0) return [];
  if (input.policy.slotIntervalMinutes <= 0 || input.policy.maximumAdvanceDays < 1) return [];

  const now = input.now ?? new Date();
  const localToday = formatInTimeZone(now, input.timeZone, "yyyy-MM-dd");
  if (
    input.date < localToday ||
    input.date > shiftDate(localToday, input.policy.maximumAdvanceDays)
  ) {
    return [];
  }

  const organizationWindows = input.windows.filter((window) => window.staffId === null);
  const organizationRanges = rangesForDate(organizationWindows, input.date, input.timeZone);
  if (organizationRanges.length === 0) return [];

  const minimumStart = new Date(now.getTime() + input.policy.minimumNoticeMinutes * MINUTE_MS);
  const serviceDuration = input.durationMinutes * MINUTE_MS;
  const bufferDuration = input.policy.bufferMinutes * MINUTE_MS;
  const step = input.policy.slotIntervalMinutes * MINUTE_MS;
  const slots = new Map<string, { startsAt: Date; endsAt: Date; staffIds: Set<string> }>();

  for (const professional of input.professionals) {
    const seenLocalStarts = new Set<string>();
    const professionalWindows = input.windows.filter(
      (window) => window.staffId === professional.id,
    );
    const professionalRanges = professionalWindows.length
      ? rangesForDate(professionalWindows, input.date, input.timeZone)
      : organizationRanges;
    const workingRanges = professionalWindows.length
      ? intersectRanges(organizationRanges, professionalRanges)
      : organizationRanges;

    const blockingRanges: TimeRange[] = [
      ...input.blocks
        .filter((block) => block.staffId === null || block.staffId === professional.id)
        .map((block) => ({ startsAt: block.startsAt, endsAt: block.endsAt })),
      ...input.appointments
        .filter((appointment) => appointment.staffId === professional.id)
        .map((appointment) => ({
          startsAt: appointment.startsAt,
          endsAt: new Date(appointment.endsAt.getTime() + bufferDuration),
        })),
    ];

    for (const workingRange of workingRanges) {
      for (
        let startsAt = new Date(workingRange.startsAt);
        startsAt.getTime() + serviceDuration + bufferDuration <= workingRange.endsAt.getTime();
        startsAt = new Date(startsAt.getTime() + step)
      ) {
        if (startsAt < minimumStart) continue;
        if (formatInTimeZone(startsAt, input.timeZone, "yyyy-MM-dd") !== input.date) continue;

        const localStart = formatInTimeZone(startsAt, input.timeZone, "yyyy-MM-dd HH:mm");
        if (seenLocalStarts.has(localStart)) continue;

        const serviceEndsAt = new Date(startsAt.getTime() + serviceDuration);
        const occupiedUntil = new Date(serviceEndsAt.getTime() + bufferDuration);
        const candidate = { startsAt, endsAt: occupiedUntil };
        if (blockingRanges.some((blocked) => overlaps(candidate, blocked))) continue;
        seenLocalStarts.add(localStart);

        const key = `${startsAt.toISOString()}|${serviceEndsAt.toISOString()}`;
        const existing = slots.get(key);
        if (existing) {
          existing.staffIds.add(professional.id);
        } else {
          slots.set(key, {
            startsAt,
            endsAt: serviceEndsAt,
            staffIds: new Set([professional.id]),
          });
        }
      }
    }
  }

  return [...slots.values()]
    .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime())
    .map((slot) =>
      Object.freeze({
        startsAt: new Date(slot.startsAt),
        endsAt: new Date(slot.endsAt),
        staffIds: Object.freeze([...slot.staffIds].sort()),
      }),
    );
}
