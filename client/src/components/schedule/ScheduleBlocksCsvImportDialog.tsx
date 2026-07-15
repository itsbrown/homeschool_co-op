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

type Step = "mapping" | "preview" | "importing" | "success" | "error";

type Props = {
  open: boolean;
  templateId: number;
  templateName: string;
  file: File | null;
  csvText: string | null;
  onClose: () => void;
  onImported?: (imported: number) => void;
};

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

function autoDetectMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();
  const aliases: Record<string, string[]> = {
    day_of_week: ["day_of_week", "day", "weekday", "day of week"],
    start_time: ["start_time", "start", "start time", "begins"],
    end_time: ["end_time", "end", "end time", "ends"],
    block_type: ["block_type", "type", "block type"],
    default_title: ["default_title", "title", "name", "block title", "default title"],
    subject_area: ["subject_area", "subject", "topic", "subject area"],
    sort_order: ["sort_order", "order", "sort", "sort order"],
  };

  for (const field of SCHEDULE_BLOCK_CSV_FIELDS) {
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

function isHintRow(row: Record<string, string>, mapping: Record<string, string>): boolean {
  const day = (row[mapping.day_of_week] || "").toLowerCase();
  const start = row[mapping.start_time] || "";
  const end = row[mapping.end_time] || "";
  const title = (row[mapping.default_title] || "").toLowerCase();
  return day === "monday" && start.startsWith("08:00") && end.startsWith("09:00") && title.includes("math 101");
}

export function ScheduleBlocksCsvImportDialog({
  open,
  templateId,
  templateName,
  file,
  csvText,
  onClose,
  onImported,
}: Props) {
  const { toast } = useToast();
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

  useEffect(() => {
    if (!open) return;
    setStep("mapping");
    setMapping(autoDetectMapping(parsed.headers));
    setImportCount(0);
    setErrorMessage(null);
    setValidationErrors([]);
  }, [open, csvText]);

  const requiredOk = SCHEDULE_BLOCK_CSV_FIELDS.filter((f) => f.required).every((f) => !!mapping[f.key]);
  const mappedCount = Object.values(mapping).filter(Boolean).length;

  const dataRows = useMemo(() => {
    if (!mapping.day_of_week) return parsed.rows;
    return parsed.rows.filter((r) => !isHintRow(r, mapping));
  }, [parsed.rows, mapping]);

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
      const res = await apiRequest(
        "POST",
        `/api/schedule-builder/skeletons/${templateId}/blocks/import-csv`,
        formData,
      );
      const data = await res.json();
      const imported = Number(data.imported ?? 0);
      setImportCount(imported);
      await queryClient.invalidateQueries({
        queryKey: ["/api/schedule-builder/skeletons", templateId, "blocks"],
      });
      setStep("success");
      toast({
        title: "CSV import complete",
        description: `Imported ${imported} time block${imported === 1 ? "" : "s"} into ${templateName}.`,
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
              Import time blocks — {templateName}
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              {step === "mapping" && "Step 1 of 2 — Map your CSV columns to schedule fields."}
              {step === "preview" && "Step 2 of 2 — Review mapped rows, then confirm. Existing blocks will be replaced."}
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
              <p className="text-sm text-muted-foreground">
                Auto-detected <Badge variant="secondary">{mappedCount}</Badge> column
                {mappedCount === 1 ? "" : "s"}. Adjust anything that looks wrong.
              </p>
              {SCHEDULE_BLOCK_CSV_FIELDS.map((field) => (
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
                  Confirming will <strong>replace all existing blocks</strong> on{" "}
                  <strong>{templateName}</strong> with {dataRows.length} row
                  {dataRows.length === 1 ? "" : "s"} from this CSV.
                </span>
              </div>
              <div className="overflow-x-auto border rounded-md">
                <table className="text-xs w-full border-collapse">
                  <thead>
                    <tr className="bg-muted">
                      {SCHEDULE_BLOCK_CSV_FIELDS.filter((f) => mapping[f.key]).map((f) => (
                        <th key={f.key} className="border px-2 py-1 text-left font-medium">
                          {f.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} className="even:bg-muted/30">
                        {SCHEDULE_BLOCK_CSV_FIELDS.filter((f) => mapping[f.key]).map((f) => (
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
                {importCount} time block{importCount === 1 ? "" : "s"} imported into {templateName}.
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
