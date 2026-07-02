import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LiteracyCohortTrendChart } from "@/components/progress-charts/LiteracyCohortTrendChart";
import { ProficiencyBandsChart } from "@/components/progress-charts/ProficiencyBandsChart";
import { ProgressChartExportCard } from "@/components/progress-charts/ProgressChartExportCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";

function currentSchoolYear(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = m >= 7 ? y : y - 1;
  return `${start}-${start + 1}`;
}

interface ProgressInsightsTabProps {
  schoolName?: string;
  locations?: { id: number; name: string }[];
}

export default function ProgressInsightsTab({
  schoolName = "Our School",
  locations = [],
}: ProgressInsightsTabProps) {
  const [schoolYear, setSchoolYear] = useState(currentSchoolYear());
  const [locationId, setLocationId] = useState("");

  const queryParams = new URLSearchParams({ schoolYear });
  if (locationId) queryParams.set("locationId", locationId);

  const { data, isLoading, error } = useQuery({
    queryKey: [`/api/progress/analytics/school?${queryParams.toString()}`],
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6 text-destructive" data-testid="error-progress-insights">
          Failed to load progress insights.
        </CardContent>
      </Card>
    );
  }

  const headline = `${data?.headline?.improvedPct ?? 0}% of students improved reading level`;

  return (
    <div className="space-y-6" data-testid="progress-insights-tab">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl">
        <div className="space-y-1">
          <Label>School year</Label>
          <Input value={schoolYear} onChange={(e) => setSchoolYear(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Campus</Label>
          <Select
            value={locationId || "all"}
            onValueChange={(v) => setLocationId(v === "all" ? "" : v)}
          >
            <SelectTrigger data-testid="select-progress-insights-location">
              <SelectValue placeholder="All campuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All campuses</SelectItem>
              {locations.map((l) => (
                <SelectItem key={l.id} value={String(l.id)}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Students with data</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.coverage?.withReadingData ?? 0}</div>
            <p className="text-xs text-muted-foreground">of {data?.coverage?.totalStudents ?? 0} total</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Improved this year</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{data?.headline?.improvedPct ?? 0}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Assessments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.totalEnrollments ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LiteracyCohortTrendChart data={data?.monthlyTrends || []} />
        <ProficiencyBandsChart bands={data?.proficiencyBands || []} />
      </div>

      <ProgressChartExportCard
        schoolName={schoolName}
        schoolYear={schoolYear}
        headline={headline}
      >
        <div className="grid grid-cols-1 gap-4">
          <LiteracyCohortTrendChart data={data?.monthlyTrends || []} />
          <ProficiencyBandsChart bands={data?.proficiencyBands || []} />
        </div>
      </ProgressChartExportCard>
    </div>
  );
}
