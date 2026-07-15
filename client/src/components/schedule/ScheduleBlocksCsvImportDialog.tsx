import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  X,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

export const SCHEDULE_BLOCK_CSV_FIELDS = [
  {
    key: "day_of_week",
    label: "Day of week",
    required: true,
    description: "Full day name (e.g. Monday)",
  },
  {
    key: "start_time",
    label: "Start time",
    required: true,
    description: "HH:MM (24h)",
  },
  {
    key: "end_time",
    label: "End time",
    required: true,
    description: "HH:MM (24h)",
  },
  {
    key: "block_type",
    label: "Block type",
    required: true,
    description: "anchor, curriculum, or flexible",
  },
  {
    key: "default_title",
    label: "Title",
    required: true,
    description: "Block title shown on the schedule",
  },
  {
    key: "subject_area",
    label: "Subject",
    required: false,
    description: "Optional subject / topic",
  },
  {
    key: "sort_order",
    label: "Sort order",
    required: false,
    description: "Optional integer order within the day",
  },
] as const;

/** Week Planner content fields — matched to template slots by day + start time. */
export const WEEK_PLAN_BLOCK_CSV_FIELDS = [
  {
    key: "day_of_week",
    label: "Day of week",
    required: true,
    description: "Full day name (e.g. Monday)",
  },
  {
    key: "start_time",
    label: "Start time",
    required: true,
    description: "Must match an existing template slot (HH:MM)",
  },
  {
    key: "end_time",
    label: "End time",
    required: false,
    description: "Optional (not used for matching)",
  },
  {
    key: "block_type",
    label: "Block type",
    required: false,
    description: "Optional (template owns block type)",
  },
  {
    key: "title",
    label: "Title",
    required: true,
    description: "Lesson title — template CSVs use default_title",
  },
  {
    key: "description",
    label: "Description",
    required: false,
    description: "Lesson description / overview",
  },
  {
    key: "objectives",
    label: "Objectives",
    required: false,
    description: "Semicolon-separated list",
  },
  {
    key: "lesson_link",
    label: "Lesson link",
    required: false,
    description: "URL to lesson materials",
  },
  {
    key: "notes",
    label: "Notes",
    required: false,
    description: "Extra notes for this week",
  },
] as const;

type FieldDef = {
  key: string;
  label: string;
  required: boolean;
  description: string;
};

type Step = "mapping" | "preview" | "importing" | "success" | "error";

type SkeletonProps = {
  mode?: "skeleton";
  open: boolean;
  templateId: number;
  templateName: string;
  weekPlanId?: never;
  weekLabel?: never;
  file: File | null;
  csvText: string | null;
  onClose: () => void;
  onImported?: (imported: number) => void;
};

type WeekPlanProps = {
  mode: "week-plan";
  open: boolean;
  weekPlanId: number;
  weekLabel: string;
  templateId?: never;
  templateName?: never;
  file: File | null;
  csvText: string | null;
  onClose: () => void;
  onImported?: (imported: number) => void;
};

export type ScheduleBlocksCsvImportDialogProps = SkeletonProps | WeekPlanProps;

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        out.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out.map((v) => v.replace(/^"|"$/g, ""));
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const vals = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = vals[i] ?? "";
    });
    return row;
  });
  return { headers, rows };
}

function autoDetectMapping(headers: string[], fields: FieldDef[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();
  const aliases: Record<string, string[]> = {
    day_of_week: ["day_of_week", "day", "weekday", "day of week"],
    start_time: ["start_time", "start", "start time", "begins"],
    end_time: ["end_time", "end", "end time", "ends"],
    block_type: ["block_type", "type", "block type"],
    default_title: ["default_title", "title", "name", "block title", "default title"],
    // Week-plan title also accepts template CSV's default_title
    title: ["title", "default_title", "name", "block title", "default title", "lesson title"],
    subject_area: ["subject_area", "subject", "topic", "subject area"],
    sort_order: ["sort_order", "order", "sort", "sort order"],
    description: ["description", "default_description", "desc", "overview"],
    objectives: ["objectives", "objective", "learning objectives"],
    lesson_link: ["lesson_link", "link", "url", "lesson url", "lesson link"],
    notes: ["notes", "note", "comments"],
  };

  for (const field of fields) {
    const opts = aliases[field.key] || [field.key];
    const match = headers.find((h) => {
      if (used.has(h)) return false;
      const n = h.toLowerCase().trim();
      return opts.some((a) => n === a || n.replace(/\s+/g, "_") === a);
    });
    if (match) {
      mapping[field.key] = match;
      used.add(match);
    }
  }
  return mapping;
}

/** Detect skeleton/template CSV shape (default_title, no week-plan title/content cols). */
export function looksLikeSkeletonCsv(headers: string[]): boolean {
  const norm = headers.map((h) => h.toLowerCase().trim().replace(/\s+/g, "_"));
  const hasDefaultTitle = norm.includes("default_title");
  const hasTitle = norm.includes("title");
  const hasWeekContent =
    norm.includes("description") ||
    norm.includes("objectives") ||
    norm.includes("lesson_link") ||
    norm.includes("notes");
  return hasDefaultTitle && !hasTitle && !hasWeekContent;
}

function isHintRow(row: Record<string, string>, mapping: Record<string, string>, mode: "skeleton" | "week-plan"): boolean {
  const day = (row[mapping.day_of_week] || "").toLowerCase();
  const start = row[mapping.start_time] || "";
  const end = row[mapping.end_time] || "";
  const titleKey = mode === "skeleton" ? "default_title" : "title";
  const title = (row[mapping[titleKey]] || "").toLowerCase();
  const lessonLink = mapping.lesson_link ? row[mapping.lesson_link] || "" : "";

  if (mode === "week-plan" && title.includes("science basics") && lessonLink.includes("example.com")) {
    return true;
  }
  return day === "monday" && start.startsWith("08:00") && end.startsWith("09:00") && title.includes("math 101");
}

export function ScheduleBlocksCsvImportDialog(props: ScheduleBlocksCsvImportDialogProps) {
  const {
    open,
    file,
    csvText,
    onClose,
    onImported,
  } = props;
  const mode = props.mode ?? "skeleton";
  const { toast } = useToast();
  const fields: FieldDef[] =
    mode === "week-plan" ? [...WEEK_PLAN_BLOCK_CSV_FIELDS] : [...SCHEDULE_BLOCK_CSV_FIELDS];

  const targetLabel =
    mode === "week-plan" ? props.weekLabel : props.templateName;

  const parsed = useMemo(() => {
    if (!csvText) return { headers: [] as string[], rows: [] as Record<string, string>[] };
    try {
      return parseCsv(csvText);
    } catch {
      return { headers: [], rows: [] };
    }
  }, [csvText]);

  const [step, setStep] = useState<Step>("mapping");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importCount, setImportCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const skeletonShaped = useMemo(
    () => mode === "week-plan" && looksLikeSkeletonCsv(parsed.headers),
    [mode, parsed.headers],
  );

  useEffect(() => {
    if (!open) return;
    setStep("mapping");
    setMapping(autoDetectMapping(parsed.headers, fields));
    setImportCount(0);
    setErrorMessage(null);
    setValidationErrors([]);
  }, [open, csvText, mode]);

  const requiredOk = fields.filter((f) => f.required).every((f) => !!mapping[f.key]);
  const mappedCount = Object.values(mapping).filter(Boolean).length;

  const dataRows = useMemo(() => {
    if (!mapping.day_of_week) return parsed.rows;
    return parsed.rows.filter((r) => !isHintRow(r, mapping, mode));
  }, [parsed.rows, mapping, mode]);

  const previewRows = dataRows.slice(0, 5);

  const handleChange = (field: string, value: string) => {
    setMapping((prev) => ({
      ...prev,
      [field]: value === "__none__" ? "" : value,
    }));
  };

  const handleImport = async () => {
    if (!file || !requiredOk) return;
    setStep("importing");
    setErrorMessage(null);
    setValidationErrors([]);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mapping", JSON.stringify(mapping));

      const url =
        mode === "week-plan"
          ? `/api/schedule-builder/week-plans/${props.weekPlanId}/blocks/import-csv`
          : `/api/schedule-builder/skeletons/${props.templateId}/blocks/import-csv`;

      const res = await apiRequest("POST", url, formData);
      const data = await res.json();
      const imported = Number(
        mode === "week-plan" ? (data.updated ?? 0) : (data.imported ?? 0),
      );
      setImportCount(imported);

      if (mode === "week-plan") {
        await queryClient.invalidateQueries({
          queryKey: ["/api/schedule-builder/week-plans", props.weekPlanId],
        });
      } else {
        await queryClient.invalidateQueries({
          queryKey: ["/api/schedule-builder/skeletons", props.templateId, "blocks"],
        });
      }

      setStep("success");
      toast({
        title: "CSV import complete",
        description:
          mode === "week-plan"
            ? `Updated ${imported} block${imported === 1 ? "" : "s"} on ${targetLabel}.`
            : `Imported ${imported} time block${imported === 1 ? "" : "s"} into ${targetLabel}.`,
      });
      onImported?.(imported);
    } catch (err: any) {
      const msg: string = err?.message || "Import failed";
      let errors: string[] = [];
      let friendly = msg;
      const jsonStart = msg.indexOf("{");
      if (jsonStart !== -1) {
        try {
          const parsedErr = JSON.parse(msg.slice(jsonStart));
          if (Array.isArray(parsedErr.errors)) errors = parsedErr.errors;
          if (parsedErr.message) friendly = parsedErr.message;
        } catch {
          /* ignore */
        }
      }
      setValidationErrors(errors);
      setErrorMessage(friendly);
      setStep("error");
      toast({
        title: "CSV import failed",
        description: errors.length > 0 ? `${errors.length} validation error(s) — see dialog.` : friendly,
        variant: "destructive",
      });
    }
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      data-testid="schedule-csv-import-dialog"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/80" aria-hidden="true" />
      <div className="relative z-10 flex w-full max-w-3xl max-h-[90vh] flex-col overflow-hidden rounded-lg border bg-background p-6 shadow-lg">
        <div className="flex items-start justify-between gap-4 pb-4 border-b">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              {mode === "week-plan"
                ? `Import week content — ${targetLabel}`
                : `Import time blocks — ${targetLabel}`}
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              {step === "mapping" && "Step 1 of 2 — Map your CSV columns to schedule fields."}
              {step === "preview" &&
                (mode === "week-plan"
                  ? "Step 2 of 2 — Review mapped rows, then confirm. Matching slots (day + start time) will be updated."
                  : "Step 2 of 2 — Review mapped rows, then confirm. Existing blocks will be replaced.")}
              {step === "importing" && "Importing…"}
              {step === "success" && "Import finished successfully."}
              {step === "error" && "Import could not be completed."}
            </p>
          </div>
          {step !== "importing" && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto py-4 space-y-4">
          {step === "mapping" && (
            <div className="space-y-4" data-testid="schedule-csv-mapping-step">
              {skeletonShaped && (
                <div
                  className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"
                  data-testid="schedule-csv-skeleton-shape-hint"
                >
                  This file looks like a <strong>Weekly Template</strong> CSV (
                  <code className="text-xs">default_title</code>, etc.). We mapped{" "}
                  <code className="text-xs">default_title</code> → Title so you can fill matching
                  week slots. To change the recurring schedule itself, import on{" "}
                  <Link href="/schools/schedule-builder" className="underline font-medium">
                    Weekly Templates
                  </Link>
                  .
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                Auto-detected <Badge variant="secondary">{mappedCount}</Badge> column
                {mappedCount === 1 ? "" : "s"}. Adjust anything that looks wrong.
              </p>
              {fields.map((field) => (
                <div key={field.key} className="flex items-start gap-3">
                  <div className="w-40 shrink-0 pt-2">
                    <Label className="text-sm font-medium">
                      {field.label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">{field.description}</p>
                  </div>
                  <Select
                    value={mapping[field.key] || "__none__"}
                    onValueChange={(v) => handleChange(field.key, v)}
                  >
                    <SelectTrigger className="flex-1" data-testid={`schedule-csv-map-${field.key}`}>
                      <SelectValue placeholder="Select column…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Skip —</SelectItem>
                      {parsed.headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-3" data-testid="schedule-csv-preview-step">
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  {mode === "week-plan" ? (
                    <>
                      Confirming will <strong>overwrite block content</strong> on{" "}
                      <strong>{targetLabel}</strong> for {dataRows.length} row
                      {dataRows.length === 1 ? "" : "s"} matched by day + start time. Unmatched
                      slots are unchanged; rows that do not match a template slot will error.
                    </>
                  ) : (
                    <>
                      Confirming will <strong>replace all existing blocks</strong> on{" "}
                      <strong>{targetLabel}</strong> with {dataRows.length} row
                      {dataRows.length === 1 ? "" : "s"} from this CSV.
                    </>
                  )}
                </span>
              </div>
              <div className="overflow-x-auto border rounded-md">
                <table className="text-xs w-full border-collapse">
                  <thead>
                    <tr className="bg-muted">
                      {fields.filter((f) => mapping[f.key]).map((f) => (
                        <th key={f.key} className="border px-2 py-1 text-left font-medium">
                          {f.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} className="even:bg-muted/30">
                        {fields.filter((f) => mapping[f.key]).map((f) => (
                          <td key={f.key} className="border px-2 py-1 truncate max-w-[140px]">
                            {row[mapping[f.key]] || "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-16 gap-3" data-testid="schedule-csv-importing">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Uploading and validating CSV…</p>
            </div>
          )}

          {step === "success" && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center" data-testid="schedule-csv-import-success">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
              <p className="text-lg font-semibold">Import complete</p>
              <p className="text-sm text-muted-foreground">
                {mode === "week-plan"
                  ? `${importCount} block${importCount === 1 ? "" : "s"} updated on ${targetLabel}.`
                  : `${importCount} time block${importCount === 1 ? "" : "s"} imported into ${targetLabel}.`}
              </p>
            </div>
          )}

          {step === "error" && (
            <div className="space-y-3" data-testid="schedule-csv-import-error">
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <p className="font-semibold flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" />
                  {errorMessage || "Import failed"}
                </p>
                {validationErrors.length > 0 && (
                  <ul className="mt-2 list-disc pl-5 space-y-1">
                    {validationErrors.slice(0, 20).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4 border-t">
          {step === "mapping" && (
            <>
              {!requiredOk ? (
                <div className="flex items-center gap-2 text-amber-600 mr-auto text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  Map all required fields to continue
                </div>
              ) : (
                <div className="flex items-center gap-2 text-green-600 mr-auto text-sm">
                  <Check className="h-4 w-4" />
                  {mappedCount} fields mapped · {dataRows.length} data rows
                </div>
              )}
              <Button variant="outline" onClick={onClose} data-testid="schedule-csv-cancel">
                Cancel
              </Button>
              <Button
                onClick={() => setStep("preview")}
                disabled={!requiredOk || dataRows.length === 0}
                data-testid="schedule-csv-mapping-next"
              >
                Next: Preview
              </Button>
            </>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("mapping")} data-testid="schedule-csv-back">
                Back
              </Button>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleImport} data-testid="schedule-csv-confirm-import">
                Confirm import ({dataRows.length})
              </Button>
            </>
          )}
          {(step === "success" || step === "error") && (
            <Button onClick={onClose} data-testid="schedule-csv-done">
              {step === "success" ? "Done" : "Close"}
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
