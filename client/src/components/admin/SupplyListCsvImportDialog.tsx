import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  SUPPLY_CSV_FIELDS,
  autoDetectSupplyCsvMapping,
  findSupplyCsvHeaderRow,
  parseCsvToMatrix,
  type SupplyCsvColumnMapping,
  type SupplyCsvFieldKey,
} from "@shared/supply-list-csv";
import type { SupplyOwnerType } from "@shared/supply-list";

type Step = "mapping" | "preview" | "importing" | "error";

type PreviewRow = {
  row: number;
  name: string;
  quantity: number;
  unit: string | null;
  notes: string | null;
  amazonStatus: "reuse" | "create" | "skip" | "error";
  amazonMessage?: string;
};

type ImportResponse = {
  items: unknown[];
  preview: PreviewRow[];
  createdProducts: number;
  reusedProducts: number;
  warnings: Array<{ row: number; message: string }>;
  message?: string;
};

const STATUS_LABEL: Record<PreviewRow["amazonStatus"], string> = {
  reuse: "Reuse shop product",
  create: "Create Amazon product",
  skip: "No Amazon link",
  error: "Amazon lookup failed",
};

export function SupplyListCsvImportDialog({
  open,
  ownerType,
  ownerId,
  existingItemCount,
  file,
  csvText,
  onClose,
  onImported,
}: {
  open: boolean;
  ownerType: SupplyOwnerType;
  ownerId: number;
  existingItemCount: number;
  file: File | null;
  csvText: string | null;
  onClose: () => void;
  onImported?: () => void;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("mapping");
  const [mapping, setMapping] = useState<SupplyCsvColumnMapping>({});
  const [append, setAppend] = useState(false);
  const [preview, setPreview] = useState<ImportResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const parsedHeaders = useMemo(() => {
    if (!csvText) return [] as string[];
    try {
      const matrix = parseCsvToMatrix(csvText);
      const headerRowIndex = findSupplyCsvHeaderRow(matrix);
      if (headerRowIndex < 0) return [];
      return matrix[headerRowIndex];
    } catch {
      return [];
    }
  }, [csvText]);

  useEffect(() => {
    if (!open) return;
    setStep("mapping");
    setAppend(false);
    setPreview(null);
    setErrorMessage(null);
    setLoadingPreview(false);
    setMapping(autoDetectSupplyCsvMapping(parsedHeaders));
  }, [open, csvText, parsedHeaders]);

  const requiredOk = Boolean(mapping.name);

  async function postImport(dryRun: boolean): Promise<ImportResponse> {
    const url = `/api/supply-lists/${ownerType}/${ownerId}/import-csv`;
    const mode = append ? "append" : "replace";
    let res: Response;
    if (file) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mapping", JSON.stringify(mapping));
      formData.append("mode", mode);
      formData.append("dryRun", dryRun ? "true" : "false");
      res = await apiRequest("POST", url, formData);
    } else {
      res = await apiRequest("POST", url, {
        csv: csvText,
        mapping,
        mode,
        dryRun,
      });
    }
    return res.json();
  }

  const handlePreview = async () => {
    if (!requiredOk || !csvText) return;
    setLoadingPreview(true);
    setErrorMessage(null);
    try {
      const data = await postImport(true);
      setPreview(data);
      setStep("preview");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not preview CSV";
      setErrorMessage(msg);
      setStep("error");
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleImport = async () => {
    if (!requiredOk || !csvText) return;
    setStep("importing");
    setErrorMessage(null);
    try {
      const data = await postImport(false);
      await queryClient.invalidateQueries({ queryKey: ["/api/supply-lists"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/supply-lists/shop-products"] });
      toast({
        title: "Supply list imported",
        description: append
          ? `Added ${data.preview?.length ?? 0} item${(data.preview?.length ?? 0) === 1 ? "" : "s"}.`
          : `Saved ${data.items?.length ?? 0} item${(data.items?.length ?? 0) === 1 ? "" : "s"}.`,
      });
      onImported?.();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Import failed";
      setErrorMessage(msg);
      setStep("error");
      toast({
        title: "CSV import failed",
        description: msg,
        variant: "destructive",
      });
    }
  };

  if (!open || typeof document === "undefined") return null;

  const previewRows = preview?.preview ?? [];

  return createPortal(
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center p-4"
      data-testid="supply-csv-import-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="supply-csv-import-title"
    >
      <div className="absolute inset-0 bg-black/80" aria-hidden="true" />
      <div className="relative z-10 flex w-full max-w-3xl max-h-[90vh] flex-col overflow-hidden rounded-lg border bg-background p-6 shadow-lg">
        <div className="flex items-start justify-between gap-4 pb-4 border-b">
          <div>
            <h2 id="supply-csv-import-title" className="text-lg font-semibold flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Import supply list CSV
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              {step === "mapping" && "Step 1 of 2 — Map spreadsheet columns. Google Sheets: File → Download → CSV of the current tab."}
              {step === "preview" && "Step 2 of 2 — Review Amazon product status, then confirm."}
              {step === "importing" && "Importing… Amazon lookups run one at a time."}
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
            <div className="space-y-4" data-testid="supply-csv-mapping-step">
              {parsedHeaders.length === 0 && (
                <p className="text-sm text-destructive">
                  Could not find a header row. Include a Supply Item (or Item) column.
                </p>
              )}
              <div className="flex items-center gap-2">
                <Switch
                  id="supply-csv-append-mapping"
                  checked={append}
                  onCheckedChange={setAppend}
                  data-testid="switch-supply-csv-append"
                />
                <Label htmlFor="supply-csv-append-mapping">Add to existing list</Label>
              </div>
              {!append && existingItemCount > 0 && (
                <p className="text-sm text-amber-700">
                  Replace this list will remove {existingItemCount} existing item
                  {existingItemCount === 1 ? "" : "s"}.
                </p>
              )}
              {SUPPLY_CSV_FIELDS.map((field) => (
                <div key={field.key} className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-2 items-center">
                  <Label htmlFor={`supply-csv-map-${field.key}`}>
                    {field.label}
                    {field.required ? " *" : ""}
                  </Label>
                  <Select
                    value={mapping[field.key as SupplyCsvFieldKey] || "__none__"}
                    onValueChange={(value) =>
                      setMapping((prev) => ({
                        ...prev,
                        [field.key]: value === "__none__" ? "" : value,
                      }))
                    }
                  >
                    <SelectTrigger id={`supply-csv-map-${field.key}`} data-testid={`select-supply-csv-map-${field.key}`}>
                      <SelectValue placeholder="Skip this column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Skip this column</SelectItem>
                      {parsedHeaders.filter((header) => header.length > 0).map((header) => (
                        <SelectItem key={header} value={header}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-4" data-testid="supply-csv-preview-step">
              <div className="flex items-center gap-2">
                <Switch
                  id="supply-csv-append-preview"
                  checked={append}
                  onCheckedChange={setAppend}
                />
                <Label htmlFor="supply-csv-append-preview">Add to existing list</Label>
              </div>
              {!append && existingItemCount > 0 && (
                <p className="text-sm text-amber-700" data-testid="supply-csv-replace-warning">
                  Replace this list will remove {existingItemCount} existing item
                  {existingItemCount === 1 ? "" : "s"}.
                </p>
              )}
              {(preview?.warnings.length ?? 0) > 0 && (
                <p className="text-sm text-amber-700">
                  {preview!.warnings.length} Amazon link{preview!.warnings.length === 1 ? "" : "s"} could not be fetched. Those rows still import without a shop product.
                </p>
              )}
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2 font-medium">Item</th>
                      <th className="text-left p-2 font-medium">Qty</th>
                      <th className="text-left p-2 font-medium">Unit</th>
                      <th className="text-left p-2 font-medium">Amazon</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, index) => (
                      <tr key={`${row.row}-${index}`} className="border-t">
                        <td className="p-2">{row.name}</td>
                        <td className="p-2">{row.quantity}</td>
                        <td className="p-2">{row.unit || "—"}</td>
                        <td className="p-2" data-testid={`supply-csv-amazon-status-${index}`}>
                          <Badge variant={row.amazonStatus === "error" ? "destructive" : "secondary"}>
                            {STATUS_LABEL[row.amazonStatus]}
                          </Badge>
                          {row.amazonMessage && (
                            <p className="text-xs text-muted-foreground mt-1">{row.amazonMessage}</p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === "importing" && (
            <div className="flex items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Importing supply list…
            </div>
          )}

          {step === "error" && (
            <p className="text-sm text-destructive" data-testid="supply-csv-import-error">
              {errorMessage || "Import failed."}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          {step === "mapping" && (
            <>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handlePreview}
                disabled={!requiredOk || loadingPreview || parsedHeaders.length === 0}
                data-testid="supply-csv-mapping-next"
              >
                {loadingPreview && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Preview Amazon links
              </Button>
            </>
          )}
          {step === "preview" && (
            <>
              <Button type="button" variant="outline" onClick={() => setStep("mapping")}>
                Back
              </Button>
              <Button type="button" onClick={handleImport} data-testid="supply-csv-confirm-import">
                {append ? "Add to list" : "Replace this list"}
              </Button>
            </>
          )}
          {step === "error" && (
            <Button type="button" variant="outline" onClick={() => setStep("mapping")}>
              Try again
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
