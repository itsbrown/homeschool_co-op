/**
 * Canonical US states + DC for school/location selectors and jurisdiction resolve.
 */

export const US_STATES = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
] as const;

export type UsStateCode = (typeof US_STATES)[number]["code"];

const CODE_SET = new Set<string>(US_STATES.map((s) => s.code));

const NAME_TO_CODE = new Map<string, UsStateCode>(
  US_STATES.flatMap((s) => [
    [s.name.toLowerCase(), s.code],
    [s.code.toLowerCase(), s.code],
  ]),
);

/** Extra aliases commonly typed into free-text state fields. */
NAME_TO_CODE.set("n.y.", "NY");
NAME_TO_CODE.set("n.y", "NY");
NAME_TO_CODE.set("new york state", "NY");
NAME_TO_CODE.set("washington dc", "DC");
NAME_TO_CODE.set("washington d.c.", "DC");
NAME_TO_CODE.set("d.c.", "DC");
NAME_TO_CODE.set("d.c", "DC");

/**
 * Normalize free-text or code to ISO-2 US state/DC code.
 * Returns null when the input cannot be mapped.
 */
export function normalizeUsState(input: string | null | undefined): UsStateCode | null {
  if (input == null) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  const upper = raw.toUpperCase();
  if (CODE_SET.has(upper)) return upper as UsStateCode;

  const byName = NAME_TO_CODE.get(raw.toLowerCase());
  return byName ?? null;
}

export function isUsStateCode(code: string | null | undefined): code is UsStateCode {
  return !!code && CODE_SET.has(code.toUpperCase());
}

export function usStateLabel(code: string | null | undefined): string {
  if (!code) return "";
  const normalized = normalizeUsState(code);
  if (!normalized) return String(code);
  return US_STATES.find((s) => s.code === normalized)?.name ?? normalized;
}
