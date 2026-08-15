/** Parse Google-Sheets-style supply list CSVs into structured rows. */

export const SUPPLY_CSV_FIELD_KEYS = [
  "name",
  "qty",
  "notes",
  "amazonLink",
  "affiliateLink",
] as const;

export type SupplyCsvFieldKey = (typeof SUPPLY_CSV_FIELD_KEYS)[number];

export const SUPPLY_CSV_FIELDS: Array<{
  key: SupplyCsvFieldKey;
  label: string;
  required?: boolean;
  aliases: string[];
}> = [
  {
    key: "name",
    label: "Supply Item",
    required: true,
    aliases: ["supply item", "item", "name", "supply", "item name"],
  },
  {
    key: "qty",
    label: "Qty / Notes",
    aliases: ["qty / notes", "qty/notes", "qty", "quantity", "qty notes", "amount"],
  },
  {
    key: "amazonLink",
    label: "Amazon Link (or Search)",
    aliases: [
      "amazon link (or search)",
      "amazon link",
      "amazon url",
      "amazon",
      "link",
      "product link",
    ],
  },
  {
    key: "notes",
    label: "Additional Notes",
    aliases: ["additional notes", "notes", "note", "comments"],
  },
  {
    key: "affiliateLink",
    label: "Affiliate Link",
    aliases: ["affiliate link", "affiliate url", "affiliate"],
  },
];

export const SUPPLY_CSV_TEMPLATE_HEADERS = SUPPLY_CSV_FIELDS.map((f) => f.label);

export const SUPPLY_CSV_TEMPLATE = `${SUPPLY_CSV_TEMPLATE_HEADERS.join(",")}
Water bottle,1,https://www.amazon.com/dp/B08WATER01,Any durable kids water bottle,
Crayons (24 count),1 box,,Crayola recommended,
Tissues,1,https://www.amazon.com/dp/B08TISSUE1,Class box,https://www.amazon.com/dp/B08TISSUE1
`;

export const MAX_SUPPLY_CSV_ROWS = 100;

export type SupplyCsvColumnMapping = Partial<Record<SupplyCsvFieldKey, string>>;

export type ParsedSupplyCsvRow = {
  sourceRow: number;
  name: string;
  quantity: number;
  unit: string | null;
  notes: string | null;
  amazonUrl: string | null;
};

export type ParseSupplyCsvResult = {
  headers: string[];
  headerRowIndex: number;
  mapping: SupplyCsvColumnMapping;
  rows: ParsedSupplyCsvRow[];
  skippedEmpty: number;
};

const FREQUENCY_RE = /^(daily|as needed|weekly|monthly|optional)$/i;

export function normalizeSupplyCsvHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[*]+$/g, "")
    .trim();
}

export function parseCsvToMatrix(text: string): string[][] {
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
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      pushCell();
      continue;
    }
    if (ch === "\n") {
      pushCell();
      pushRow();
      continue;
    }
    if (ch === "\r") {
      continue;
    }
    cur += ch;
  }
  pushCell();
  pushRow();
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c.length === 0)) {
    rows.pop();
  }
  return rows;
}

export function autoDetectSupplyCsvMapping(headers: string[]): SupplyCsvColumnMapping {
  const mapping: SupplyCsvColumnMapping = {};
  const used = new Set<string>();
  for (const field of SUPPLY_CSV_FIELDS) {
    const match = headers.find((h) => {
      if (used.has(h)) return false;
      const n = normalizeSupplyCsvHeader(h);
      return field.aliases.some((alias) => n === alias || n.replace(/\s+/g, "_") === alias.replace(/\s+/g, "_"));
    });
    if (match) {
      mapping[field.key] = match;
      used.add(match);
    }
  }
  return mapping;
}

export function findSupplyCsvHeaderRow(matrix: string[][]): number {
  for (let i = 0; i < matrix.length; i++) {
    const mapping = autoDetectSupplyCsvMapping(matrix[i]);
    if (mapping.name) return i;
  }
  return -1;
}

export function parseSupplyQtyNotes(raw: string): {
  quantity: number;
  unit: string | null;
  qtyNotes: string | null;
} {
  const text = raw.trim();
  if (!text) return { quantity: 1, unit: null, qtyNotes: null };

  const match = text.match(/^(\d{1,2})\s*(.*)$/);
  if (match) {
    const n = Number(match[1]);
    const quantity = n >= 1 && n <= 99 ? n : 1;
    const rest = match[2].trim();
    if (!rest) return { quantity, unit: null, qtyNotes: null };
    if (FREQUENCY_RE.test(rest)) return { quantity, unit: null, qtyNotes: rest };
    if (rest.length <= 40) return { quantity, unit: rest, qtyNotes: null };
    return { quantity, unit: null, qtyNotes: rest };
  }

  if (FREQUENCY_RE.test(text)) {
    return { quantity: 1, unit: null, qtyNotes: text };
  }
  if (text.length <= 40) {
    return { quantity: 1, unit: text, qtyNotes: null };
  }
  return { quantity: 1, unit: null, qtyNotes: text };
}

function cell(row: string[], headers: string[], headerName: string | undefined): string {
  if (!headerName) return "";
  const idx = headers.findIndex((h) => h === headerName);
  if (idx < 0) return "";
  return (row[idx] ?? "").trim();
}

function combineNotes(parts: Array<string | null | undefined>): string | null {
  const cleaned = parts.map((p) => p?.trim()).filter((p): p is string => !!p);
  if (cleaned.length === 0) return null;
  return cleaned.join(". ").slice(0, 500);
}

function pickAmazonUrl(affiliate: string, amazon: string): string | null {
  const preferred = affiliate || amazon;
  if (!preferred) return null;
  try {
    const parsed = new URL(preferred);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return preferred;
  } catch {
    return null;
  }
}

export function parseSupplyCsvText(
  text: string,
  mappingOverride?: SupplyCsvColumnMapping | null,
): ParseSupplyCsvResult {
  const matrix = parseCsvToMatrix(text);
  const headerRowIndex = findSupplyCsvHeaderRow(matrix);
  if (headerRowIndex < 0) {
    throw new Error(
      'Could not find a header row. Include a "Supply Item" (or Item) column. Google Sheets: download the current tab as CSV.',
    );
  }
  const headers = matrix[headerRowIndex];
  const mapping = {
    ...autoDetectSupplyCsvMapping(headers),
    ...(mappingOverride ?? {}),
  };
  if (!mapping.name) {
    throw new Error('CSV must include a Supply Item / Item column.');
  }

  const rows: ParsedSupplyCsvRow[] = [];
  let skippedEmpty = 0;
  for (let i = headerRowIndex + 1; i < matrix.length; i++) {
    const raw = matrix[i];
    const name = cell(raw, headers, mapping.name);
    if (!name) {
      skippedEmpty += 1;
      continue;
    }
    const qtyParsed = parseSupplyQtyNotes(cell(raw, headers, mapping.qty));
    const notes = combineNotes([
      qtyParsed.qtyNotes,
      cell(raw, headers, mapping.notes),
    ]);
    const amazonUrl = pickAmazonUrl(
      cell(raw, headers, mapping.affiliateLink),
      cell(raw, headers, mapping.amazonLink),
    );
    rows.push({
      sourceRow: i + 1,
      name: name.slice(0, 200),
      quantity: qtyParsed.quantity,
      unit: qtyParsed.unit,
      notes,
      amazonUrl,
    });
    if (rows.length >= MAX_SUPPLY_CSV_ROWS) break;
  }

  return { headers, headerRowIndex, mapping, rows, skippedEmpty };
}
