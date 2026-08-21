export type PublicContactChannel = "EMAIL" | "PHONE";

export type NormalizedContact = Readonly<{
  channel: PublicContactChannel;
  value: string;
}>;

const E164_PATTERN = /^\+[1-9]\d{7,14}$/u;

export function normalizeEmail(value: string) {
  const normalized = value.normalize("NFKC").trim().toLowerCase();
  return normalized.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)
    ? normalized
    : null;
}

export function normalizePhone(value: string) {
  const compact = value
    .normalize("NFKC")
    .trim()
    .replace(/[\s().-]/gu, "");
  const withCountryCode = /^3\d{9}$/u.test(compact) ? `+57${compact}` : compact;
  return E164_PATTERN.test(withCountryCode) ? withCountryCode : null;
}

export function normalizeContact(
  channel: PublicContactChannel,
  value: string,
): NormalizedContact | null {
  const normalized = channel === "EMAIL" ? normalizeEmail(value) : normalizePhone(value);
  return normalized ? Object.freeze({ channel, value: normalized }) : null;
}

export function maskContact(contact: NormalizedContact) {
  if (contact.channel === "EMAIL") {
    const [local, domain] = contact.value.split("@");
    return `${local.slice(0, 2)}***@${domain}`;
  }
  return `***${contact.value.slice(-4)}`;
}

export function splitCustomerName(value: string) {
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  const [firstName, ...lastNameParts] = normalized.split(" ");
  return Object.freeze({ firstName, lastName: lastNameParts.join(" ") || null });
}
