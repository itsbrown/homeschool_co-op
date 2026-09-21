const HEADINGS = ["title", "objectives", "materials", "homework", "script", "notes", "handouts", "lessonFor", "ignore"] as const;
type Heading = (typeof HEADINGS)[number];

const HEADING_ALIASES: Array<{ re: RegExp; heading: Heading }> = [
  { re: /^title\s*:?$/i, heading: "title" },
  { re: /^objectives?\s*:?$/i, heading: "objectives" },
  { re: /^what success looks like\s*:?$/i, heading: "objectives" },
  { re: /^materials?\s*:?$/i, heading: "materials" },
  { re: /^homework\s*:?$/i, heading: "homework" },
  { re: /^(timed\s+)?(mentor\s+)?script\b/i, heading: "script" },
  { re: /^notes?\s*:?$/i, heading: "notes" },
  { re: /^keys to the lesson\s*:?$/i, heading: "notes" },
  { re: /^handouts?\s*:?$/i, heading: "handouts" },
  { re: /^(?:\d{2}\s*·\s*)?what this lesson is for\s*:?$/i, heading: "lessonFor" },
  { re: /^how to set the room/i, heading: "ignore" },
  { re: /^how to use this file/i, heading: "ignore" },
];

const BRANDING_LINE =
  /^(american seekers academy|learn better\.|logic hall\b|grammar hall\b|term$|content spine|how to use this file|fall 20\d\d$)/i;

export function extractDriveFileId(urlOrId: string): string {
  const trimmed = urlOrId.trim();
  const doc = trimmed.match(/\/(?:document|file|presentation|spreadsheets)\/d\/([a-zA-Z0-9_-]+)/);
  if (doc) return doc[1];
  const folder = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folder) return folder[1];
  const open = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (open) return open[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  throw new Error(`Could not read a Drive file id from "${urlOrId}"`);
}

function headingOf(line: string): Heading | null {
  const cleaned = line
    .replace(/^\s*#{1,3}\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/^\d{2}\s*·\s*/, "")
    .trim();
  if (!cleaned) return null;
  for (const alias of HEADING_ALIASES) {
    if (alias.re.test(cleaned)) return alias.heading;
  }
  return null;
}

function linesToList(body: string): string[] {
  return body
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+\.)\s+/, "").trim())
    .filter(Boolean)
    .filter((line) => !/^by the end of the lesson/i.test(line));
}

function firstTitleLine(text: string, fromHeading: string | undefined): string {
  const fromSection = fromHeading?.split(/\r?\n/).find((l) => l.trim())?.trim();
  if (fromSection) return fromSection;
  for (const raw of text.split(/\r?\n/).slice(0, 12)) {
    const line = raw.trim();
    if (!line || BRANDING_LINE.test(line)) continue;
    if (headingOf(line)) continue;
    if (line.length < 8) continue;
    return line;
  }
  return "";
}

function collectSections(text: string): Map<Heading, string> {
  const sections = new Map<Heading, string>();
  let current: Heading | null = null;
  const buf: string[] = [];

  const flush = () => {
    if (!current) return;
    sections.set(current, buf.join("\n").trim());
    buf.length = 0;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const heading = headingOf(rawLine);
    if (heading) {
      flush();
      current = heading;
      continue;
    }
    if (current) buf.push(rawLine);
  }
  flush();
  return sections;
}

export type ParsedLessonDoc = {
  title: string;
  description: string;
  objectives: string[];
  materials: string[];
  homework: string | null;
  notes: string | null;
  handouts: string[];
};

export function parseLessonDocFields(text: string): ParsedLessonDoc {
  const sections = collectSections(text);
  const title = firstTitleLine(text, sections.get("title"));
  const description = (sections.get("script") || sections.get("lessonFor") || "").trim();
  const homework = sections.get("homework")?.trim() || null;
  const notes = sections.get("notes")?.trim() || null;
  return {
    title,
    description,
    objectives: linesToList(sections.get("objectives") ?? ""),
    materials: linesToList(sections.get("materials") ?? ""),
    homework,
    notes,
    handouts: linesToList(sections.get("handouts") ?? ""),
  };
}

export function parseLessonDocHeadings(text: string): ParsedLessonDoc {
  const parsed = parseLessonDocFields(text);
  if (!parsed.title) throw new Error("Lesson Doc is missing a Title heading");
  if (!parsed.description) throw new Error("Lesson Doc is missing a Script heading");
  return parsed;
}
