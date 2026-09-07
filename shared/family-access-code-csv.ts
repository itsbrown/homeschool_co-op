/** Parse family door-code CSVs (email + code, optional location). */

export const FAMILY_ACCESS_CSV_FIELD_KEYS = ["email", "code", "location"] as const;
export type FamilyAccessCsvFieldKey = (typeof FAMILY_ACCESS_CSV_FIELD_KEYS)[number];

export const FAMILY_ACCESS_CSV_FIELDS: Array<{
  key: FamilyAccessCsvFieldKey;
  label: string;
  required?: boolean;
  aliases: string[];
}> = [
  {
    key: "email",
    label: "Email",
    required: true,
    aliases: ["email", "parent email", "parent_email", "e-mail"],
  },
  {
    key: "code",
    label: "Door code",
    required: true,
    aliases: ["door code", "code", "pin", "keypad", "access code", "door_code"],
  },
  {
    key: "location",
    label: "Location",
    aliases: ["location", "campus", "location name", "location code", "campus name"],
  },
];

export const FAMILY_ACCESS_CSV_TEMPLATE_HEADERS = ["Email", "Door code", "Location"];

export const FAMILY_ACCESS_CSV_TEMPLATE = `${FAMILY_ACCESS_CSV_TEMPLATE_HEADERS.join(",")}
parent@example.com,4821,Brighton
`;

export const MAX_FAMILY_ACCESS_CSV_ROWS = 500;

export type FamilyAccessCsvColumnMapping = Partial<Record<FamilyAccessCsvFieldKey, string>>;

export type ParsedFamilyAccessCsvRow = {
  sourceRow: number;
  email: string;
  code: string;
  location: string | null;
};

export type ParseFamilyAccessCsvResult = {
  headers: string[];
  headerRowIndex: number;
  mapping: FamilyAccessCsvColumnMapping;
  rows: ParsedFamilyAccessCsvRow[];
  errors: Array<{ row: number; message: string }>;
  skippedEmpty: number;
};

export function normalizeFamilyAccessCsvHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[*]+$/g, "")
    .trim();
}

export function parseFamilyAccessCsvToMatrix(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;

  const pushCell = () => {
    row.push(cur.trim());
    cur = "";
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushCell();
    } else if (ch === "\n") {
      pushCell();
      pushRow();
    } else if (ch === "\r") {
      continue;
    } else {
      cur += ch;
    }
  }
  if (cur.length > 0 || row.length > 0) {
    pushCell();
    pushRow();
  }
  return rows.filter((r) => r.some((c) => c.length > 0));
}

export function findFamilyAccessCsvHeaderRow(matrix: string[][]): number {
  for (let i = 0; i < Math.min(matrix.length, 8); i++) {
    const cells = matrix[i].map(normalizeFamilyAccessCsvHeader);
    const hasEmail = cells.some((c) =>
      FAMILY_ACCESS_CSV_FIELDS.find((f) => f.key === "email")!.aliases.includes(c),
    );
    const hasCode = cells.some((c) =>
      FAMILY_ACCESS_CSV_FIELDS.find((f) => f.key === "code")!.aliases.includes(c),
    );
    if (hasEmail && hasCode) return i;
  }
  return 0;
}

export function autoDetectFamilyAccessCsvMapping(headers: string[]): FamilyAccessCsvColumnMapping {
  const mapping: FamilyAccessCsvColumnMapping = {};
  const normalized = headers.map(normalizeFamilyAccessCsvHeader);
  for (const field of FAMILY_ACCESS_CSV_FIELDS) {
    const idx = normalized.findIndex((h) => field.aliases.includes(h));
    if (idx >= 0) mapping[field.key] = headers[idx];
  }
  return mapping;
}

export function cellForHeader(
  row: string[],
  headers: string[],
  headerName: string | undefined,
): string {
  if (!headerName) return "";
  const idx = headers.findIndex(
    (h) => normalizeFamilyAccessCsvHeader(h) === normalizeFamilyAccessCsvHeader(headerName),
  );
  if (idx < 0) return "";
  return (row[idx] ?? "").trim();
}

export function parseFamilyAccessCsvText(
  text: string,
  mappingOverride?: FamilyAccessCsvColumnMapping | null,
): ParseFamilyAccessCsvResult {
  const matrix = parseFamilyAccessCsvToMatrix(text);
  if (matrix.length === 0) {
    return {
      headers: [],
      headerRowIndex: 0,
      mapping: {},
      rows: [],
      errors: [{ row: 0, message: "CSV is empty" }],
      skippedEmpty: 0,
    };
  }

  const headerRowIndex = findFamilyAccessCsvHeaderRow(matrix);
  const headers = matrix[headerRowIndex] ?? [];
  const mapping = {
    ...autoDetectFamilyAccessCsvMapping(headers),
    ...(mappingOverride ?? {}),
  };

  const errors: Array<{ row: number; message: string }> = [];
  if (!mapping.email) errors.push({ row: headerRowIndex + 1, message: "Missing Email column" });
  if (!mapping.code) errors.push({ row: headerRowIndex + 1, message: "Missing Door code column" });

  const rows: ParsedFamilyAccessCsvRow[] = [];
  let skippedEmpty = 0;
  const seenEmails = new Set<string>();
  const seenCodes = new Map<string, number>();

  for (let i = headerRowIndex + 1; i < matrix.length; i++) {
    if (rows.length >= MAX_FAMILY_ACCESS_CSV_ROWS) {
      errors.push({ row: i + 1, message: `Stopped at ${MAX_FAMILY_ACCESS_CSV_ROWS} data rows` });
      break;
    }
    const email = cellForHeader(matrix[i], headers, mapping.email).toLowerCase();
    const code = cellForHeader(matrix[i], headers, mapping.code);
    const locationRaw = cellForHeader(matrix[i], headers, mapping.location);
    if (!email && !code) {
      skippedEmpty += 1;
      continue;
    }
    const sourceRow = i + 1;
    if (!email) {
      errors.push({ row: sourceRow, message: "Missing email" });
      continue;
    }
    if (!code) {
      errors.push({ row: sourceRow, message: "Missing door code" });
      continue;
    }
    if (seenEmails.has(email)) {
      errors.push({ row: sourceRow, message: `Duplicate email ${email}` });
      continue;
    }
    seenEmails.add(email);
    const prior = seenCodes.get(code);
    if (prior != null) {
      errors.push({ row: sourceRow, message: `Duplicate door code (also row ${prior})` });
      continue;
    }
    seenCodes.set(code, sourceRow);
    rows.push({
      sourceRow,
      email,
      code,
      location: locationRaw || null,
    });
  }

  return { headers, headerRowIndex, mapping, rows, errors, skippedEmpty };
}

export function accessCodeLast4(code: string): string {
  const trimmed = code.trim();
  if (trimmed.length <= 4) return trimmed;
  return trimmed.slice(-4);
}
