import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { captureChartElement, downloadChartBlob, type ChartExportPreset } from "@/lib/chartExport";
import { Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ProgressChartExportCardProps {
  schoolName: string;
  schoolYear: string;
  headline: string;
  children: React.ReactNode;
}

export function ProgressChartExportCard({
  schoolName,
  schoolYear,
  headline,
  children,
}: ProgressChartExportCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [preset, setPreset] = useState<ChartExportPreset>("social_square");
  const [exporting, setExporting] = useState(false);

  const onExport = async () => {
    if (!ref.current) return;
    setExporting(true);
    try {
      const blob = await captureChartElement(ref.current, preset);
      const slug = schoolName.replace(/\s+/g, "-").toLowerCase();
      downloadChartBlob(blob, `${slug}-literacy-${schoolYear}.png`);
    } catch (e) {
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : "Could not create image",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div
        ref={ref}
        data-chart-export
        className="rounded-lg border bg-white p-6 space-y-4"
      >
        <div className="text-center space-y-1">
          <p className="text-sm text-muted-foreground">{schoolName}</p>
          <h2 className="text-2xl font-bold">{headline}</h2>
          <p className="text-sm text-muted-foreground">School year {schoolYear}</p>
        </div>
        {children}
        <p className="text-center text-xs text-muted-foreground pt-2">
          Powered by ASA Learning Platform
        </p>
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Download for social</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Select value={preset} onValueChange={(v) => setPreset(v as ChartExportPreset)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="social_square">Square (1080×1080)</SelectItem>
              <SelectItem value="social_landscape">Landscape (1200×630)</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={onExport} disabled={exporting}>
            <Download className="h-4 w-4 mr-2" />
            {exporting ? "Exporting…" : "Download PNG"}
          </Button>
          <p className="text-xs text-muted-foreground w-full">
            Exports contain aggregate data only — safe for public sharing.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
