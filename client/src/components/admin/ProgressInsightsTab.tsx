import { useQuery } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LiteracyCohortTrendChart } from "@/components/progress-charts/LiteracyCohortTrendChart";
import { LiteracyCohortLexileChart } from "@/components/progress-charts/LiteracyCohortLexileChart";
import { ProficiencyBandsChart } from "@/components/progress-charts/ProficiencyBandsChart";
import { ProgressChartExportCard } from "@/components/progress-charts/ProgressChartExportCard";
import { ChildReadingProgressChart } from "@/components/progress-charts/ChildReadingProgressChart";
import { ChildMathProgressChart } from "@/components/progress-charts/ChildMathProgressChart";
import {
  MultiStudentLexileChart,
  type StudentSeries,
} from "@/components/progress-charts/MultiStudentLexileChart";
import StudentSearchSelect from "@/components/lexile/StudentSearchSelect";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMemo, useState } from "react";

const MAX_COMPARE = 8;

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
  const [jurisdictionCode, setJurisdictionCode] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const { data: jurisdictionsData } = useQuery<{
    jurisdictions: Array<{
      code: string;
      name: string;
      hasKpiData: boolean;
      hasStandardsData: boolean;
    }>;
    resolved: { code: string; name: string };
  }>({
    queryKey: ["/api/education-standards/jurisdictions"],
  });

  // Empty user selection = let the server resolve from school.state (do not force US).
  const activeJurisdiction =
    jurisdictionCode || jurisdictionsData?.resolved?.code || "";

  const queryParams = new URLSearchParams({ schoolYear });
  if (locationId) queryParams.set("locationId", locationId);
  // Only pass override when the admin picks a jurisdiction.
  if (jurisdictionCode) {
    queryParams.set("jurisdictionCode", jurisdictionCode);
  }

  const { data, isLoading, error } = useQuery({
    queryKey: [`/api/progress/analytics/school?${queryParams.toString()}`],
  });

  const selectJurisdiction =
    jurisdictionCode || data?.jurisdiction?.code || jurisdictionsData?.resolved?.code || undefined;

  const idsParam = selectedIds.join(",");
  const { data: batchData, isLoading: batchLoading } = useQuery<{
    children: Array<{
      child: { id: number; firstName: string; lastName?: string; gradeLevel?: string };
      reading?: { series: { date: string; lexile: number | null }[] };
      math?: { series: any[] };
      readingBand?: { atMin: number; atMax: number } | null;
      jurisdiction?: { name: string };
    }>;
  }>({
    queryKey: [
      `/api/progress/analytics/children?ids=${idsParam}&schoolYear=${encodeURIComponent(schoolYear)}`,
    ],
    enabled: selectedIds.length > 0,
  });

  const jurisdictionOptions = useMemo(() => {
    const list = jurisdictionsData?.jurisdictions || [];
    const withData = list.filter((j) => j.hasKpiData || j.code === "US");
    return withData.length ? withData : [{ code: "US", name: "National (US)", hasKpiData: true, hasStandardsData: true }];
  }, [jurisdictionsData]);

  const singleChild = selectedIds.length === 1 ? batchData?.children?.[0] : null;
  const multiSeries: StudentSeries[] = (batchData?.children || []).map((c) => ({
    childId: c.child.id,
    label: `${c.child.firstName}${c.child.lastName ? ` ${c.child.lastName}` : ""}`,
    series: c.reading?.series || [],
  }));

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

  const jurisdictionName =
    data?.jurisdiction?.name ||
    jurisdictionOptions.find((j) => j.code === activeJurisdiction)?.name ||
    activeJurisdiction;
  const headline = `${data?.headline?.improvedPct ?? 0}% of students improved reading level`;

  return (
    <div className="space-y-6" data-testid="progress-insights-tab">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" data-testid="badge-jurisdiction">
          Standards: {jurisdictionName}
        </Badge>
        {data?.jurisdiction?.sourceNote && (
          <span className="text-xs text-muted-foreground">{data.jurisdiction.sourceNote}</span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl">
        <div className="space-y-1">
          <Label>School year</Label>
          <Input
            value={schoolYear}
            onChange={(e) => setSchoolYear(e.target.value)}
            data-testid="input-progress-school-year"
          />
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
        <div className="space-y-1">
          <Label>Standards jurisdiction</Label>
          <Select
            value={selectJurisdiction}
            onValueChange={(v) => setJurisdictionCode(v)}
          >
            <SelectTrigger data-testid="select-jurisdiction">
              <SelectValue placeholder="Jurisdiction" />
            </SelectTrigger>
            <SelectContent>
              {jurisdictionOptions.map((j) => (
                <SelectItem key={j.code} value={j.code}>
                  {j.name}
                  {!j.hasKpiData && j.code !== "US" ? " (uses National)" : ""}
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

      <ProgressChartExportCard
        schoolName={schoolName}
        schoolYear={schoolYear}
        headline={headline}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <LiteracyCohortLexileChart data={data?.cohortTrend || []} />
          <ProficiencyBandsChart
            bands={data?.proficiencyBands || []}
            jurisdictionName={jurisdictionName}
          />
        </div>
      </ProgressChartExportCard>

      <LiteracyCohortTrendChart data={data?.monthlyTrends || []} />

      <Card data-testid="student-progress-picker-card">
        <CardHeader>
          <CardTitle className="text-lg">Student progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 max-w-md">
            <Label>Add student (up to {MAX_COMPARE})</Label>
            <StudentSearchSelect
              onSelect={(id) => {
                if (id == null) return;
                setSelectedIds((prev) => {
                  if (prev.includes(id) || prev.length >= MAX_COMPARE) return prev;
                  return [...prev, id];
                });
              }}
            />
          </div>
          {selectedIds.length > 0 && (
            <div className="flex flex-wrap gap-2" data-testid="selected-students-chips">
              {selectedIds.map((id) => {
                const c = batchData?.children?.find((x) => x.child.id === id);
                const label = c
                  ? `${c.child.firstName}${c.child.lastName ? ` ${c.child.lastName}` : ""}`
                  : `#${id}`;
                return (
                  <Badge key={id} variant="outline" className="gap-1 pr-1">
                    {label}
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-5 w-5"
                      data-testid={`remove-student-${id}`}
                      onClick={() => setSelectedIds((prev) => prev.filter((x) => x !== id))}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                );
              })}
            </div>
          )}

          {batchLoading && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!batchLoading && selectedIds.length === 1 && singleChild && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="single-student-charts">
              <ChildReadingProgressChart
                series={singleChild.reading?.series || []}
                childGradeLevel={singleChild.child.gradeLevel}
                bandAtMin={singleChild.readingBand?.atMin}
                bandAtMax={singleChild.readingBand?.atMax}
                jurisdictionName={singleChild.jurisdiction?.name || jurisdictionName}
              />
              <ChildMathProgressChart series={singleChild.math?.series || []} />
            </div>
          )}

          {!batchLoading && selectedIds.length > 1 && (
            <MultiStudentLexileChart students={multiSeries} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
