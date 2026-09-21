/** Profile keys that Form Builder can auto-fill for a logged-in member. */
export const FORM_AUTO_FILL_KEYS = [
  "memberId",
  "firstName",
  "lastName",
  "fullName",
  "email",
  "phone",
  "location",
] as const;

export type FormAutoFillKey = (typeof FORM_AUTO_FILL_KEYS)[number];

/** Explicit opt-out stored on `fieldConfig.autoFill`. */
export const FORM_AUTO_FILL_NONE = "none";

/** Sentinel for the Form Editor select (Radix cannot use an empty value). */
export const FORM_AUTO_FILL_AUTOMATIC = "automatic";

export type FormPrefill = {
  memberId: string | null;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string | null;
  location: string | null;
};

export const FORM_AUTO_FILL_EDITOR_OPTIONS: { value: string; label: string }[] = [
  { value: FORM_AUTO_FILL_AUTOMATIC, label: "Automatic" },
  { value: FORM_AUTO_FILL_NONE, label: "Off" },
  { value: "memberId", label: "Member ID" },
  { value: "firstName", label: "First name" },
  { value: "lastName", label: "Last name" },
  { value: "fullName", label: "Full name" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "location", label: "Campus" },
];

const SKIP_LABEL_RE =
  /\b(emergency|child|children|student|spouse|partner|reference|other)\b/i;

function isFormAutoFillKey(value: string): value is FormAutoFillKey {
  return (FORM_AUTO_FILL_KEYS as readonly string[]).includes(value);
}

function normalizeLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[:*]+$/g, "")
    .replace(/\s+/g, " ");
}

function explicitAutoFill(fieldConfig: unknown): FormAutoFillKey | "none" | null {
  if (!fieldConfig || typeof fieldConfig !== "object") return null;
  const raw = (fieldConfig as { autoFill?: unknown }).autoFill;
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  if (value === FORM_AUTO_FILL_NONE || value === FORM_AUTO_FILL_AUTOMATIC) {
    return value === FORM_AUTO_FILL_NONE ? FORM_AUTO_FILL_NONE : null;
  }
  return isFormAutoFillKey(value) ? value : null;
}

export function emptyFormPrefill(): FormPrefill {
  return {
    memberId: null,
    firstName: "",
    lastName: "",
    fullName: "",
    email: "",
    phone: null,
    location: null,
  };
}

export function isMemberIdAutoFill(key: FormAutoFillKey | null): boolean {
  return key === "memberId";
}

export function editorAutoFillValue(fieldConfig: unknown): string {
  const explicit = explicitAutoFill(fieldConfig);
  if (explicit === FORM_AUTO_FILL_NONE) return FORM_AUTO_FILL_NONE;
  if (explicit) return explicit;
  return FORM_AUTO_FILL_AUTOMATIC;
}

export function inferAutoFillKey(opts: {
  fieldType?: string | null;
  label?: string | null;
  fieldConfig?: unknown;
}): FormAutoFillKey | null {
  const explicit = explicitAutoFill(opts.fieldConfig);
  if (explicit === FORM_AUTO_FILL_NONE) return null;
  if (explicit) return explicit;

  const label = normalizeLabel(opts.label ?? "");
  const type = (opts.fieldType ?? "").trim().toLowerCase();
  if (label && SKIP_LABEL_RE.test(label)) return null;

  if (
    type === "email" ||
    label === "email" ||
    label === "email address" ||
    label === "e-mail" ||
    label === "e-mail address"
  ) {
    return "email";
  }
  if (
    type === "phone" ||
    label === "phone" ||
    label === "phone number" ||
    label === "mobile" ||
    label === "mobile number" ||
    label === "cell" ||
    label === "cell phone"
  ) {
    return "phone";
  }
  if (
    label === "member id" ||
    label === "membership id" ||
    label === "member #" ||
    label === "member number"
  ) {
    return "memberId";
  }
  if (label === "first name" || label === "firstname" || label === "given name") {
    return "firstName";
  }
  if (
    label === "last name" ||
    label === "lastname" ||
    label === "surname" ||
    label === "family name"
  ) {
    return "lastName";
  }
  if (
    label === "full name" ||
    label === "your name" ||
    label === "name" ||
    label === "parent name"
  ) {
    return "fullName";
  }
  if (label === "location" || label === "campus" || label === "school location") {
    return "location";
  }
  return null;
}
