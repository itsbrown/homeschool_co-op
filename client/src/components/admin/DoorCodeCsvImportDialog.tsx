import { useMemo, useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  FAMILY_ACCESS_CSV_TEMPLATE,
  autoDetectFamilyAccessCsvMapping,
  findFamilyAccessCsvHeaderRow,
  parseFamilyAccessCsvToMatrix,
} from "@shared/family-access-code-csv";

type PreviewRow = {
  row: number;
  email: string;
  code: string;
  status: "ok" | "error";
  message?: string;
};

type ImportResponse = {
  dryRun: boolean;
  assigned: number;
  errors: number;
  preview: PreviewRow[];
};

export function DoorCodeCsvImportDialog({
  open,
  onOpenChange,
  locationId,
  locationName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationId: number;
  locationName: string;
}) {
  const { toast } = useToast();
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<ImportResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const mapping = useMemo(() => {
    if (!csv.trim()) return null;
    const matrix = parseFamilyAccessCsvToMatrix(csv);
    if (matrix.length === 0) return null;
    const headerIdx = findFamilyAccessCsvHeaderRow(matrix);
    return autoDetectFamilyAccessCsvMapping(matrix[headerIdx] ?? []);
  }, [csv]);

  const reset = () => {
    setCsv("");
    setPreview(null);
    setBusy(false);
  };

  const runImport = async (dryRun: boolean) => {
    setBusy(true);
    try {
      const res = await apiRequest("POST", "/api/school-admin/access-codes/import", {
        csv,
        locationId,
        dryRun,
        mapping,
      });
      const json = (await res.json()) as ImportResponse;
      setPreview(json);
      if (!dryRun) {
        toast({
          title: "Door codes imported",
          description: `Assigned ${json.assigned}. ${json.errors} row(s) skipped.`,
        });
        queryClient.invalidateQueries({
          predicate: (q) => String(q.queryKey[0] ?? "").startsWith("/api/school-admin/access-codes"),
        });
        onOpenChange(false);
        reset();
      }
    } catch (error) {
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Could not import CSV",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg" data-testid="dialog-door-code-csv">
        <DialogHeader>
          <DialogTitle>Import door codes</DialogTitle>
          <DialogDescription>
            CSV for {locationName}. Columns: Email, Door code. Parents must already be on this campus.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Label htmlFor="door-code-csv">CSV</Label>
          <textarea
            id="door-code-csv"
            data-testid="textarea-door-code-csv"
            className="min-h-[140px] w-full rounded-md border bg-background p-2 font-mono text-sm"
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              setPreview(null);
            }}
            placeholder={FAMILY_ACCESS_CSV_TEMPLATE}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => runImport(true)}
              disabled={busy || !csv.trim()}
              data-testid="button-door-code-csv-preview"
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
              Preview
            </Button>
            <Button
              type="button"
              onClick={() => runImport(false)}
              disabled={busy || !csv.trim()}
              data-testid="button-door-code-csv-import"
            >
              Import
            </Button>
          </div>
          {preview && (
            <p className="text-sm text-muted-foreground" data-testid="text-door-code-csv-preview">
              {preview.preview.filter((r) => r.status === "ok").length} ready, {preview.errors} error
              {preview.errors === 1 ? "" : "s"}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
