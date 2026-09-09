import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LiteracyCohortTrendChart } from "@/components/progress-charts/LiteracyCohortTrendChart";
import { ProficiencyBandsChart } from "@/components/progress-charts/ProficiencyBandsChart";
import { MathLevelDistributionChart } from "@/components/progress-charts/MathLevelDistributionChart";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useState } from "react";

function currentSchoolYear(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = m >= 7 ? y : y - 1;
  return `${start}-${start + 1}`;
}

type WorklistFilter = "lexile" | "math" | "either" | null;

interface ProgressInsightsTabProps {
  schoolName?: string;
  locations?: { id: number; name: string }[];
}

interface MissingStudent {
  childId: number;
  firstName: string;
  lastName: string;
  gradeLevel: string | null;
  campus: string | null;
  missing: Array<"lexile" | "math">;
}

export default function ProgressInsightsTab({
  schoolName = "Our School",
  locations = [],
}: ProgressInsightsTabProps) {
  const [schoolYear, setSchoolYear] = useState(currentSchoolYear());
  const [locationId, setLocationId] = useState("");
  const [worklistFilter, setWorklistFilter] = useState<WorklistFilter>(null);

  const queryParams = new URLSearchParams({ schoolYear });
  if (locationId) queryParams.set("locationId", locationId);

  const { data, isLoading, error } = useQuery({
    queryKey: [`/api/progress/analytics/school?${queryParams.toString()}`],
  });

  const missingParams = new URLSearchParams();
  if (worklistFilter) missingParams.set("missing", worklistFilter);
  if (locationId) missingParams.set("locationId", locationId);

  const { data: missingData, isLoading: missingLoading } = useQuery<{
    count: number;
    students: MissingStudent[];
  }>({
    queryKey: [`/api/progress/analytics/school/missing-levels?${missingParams.toString()}`],
    enabled: worklistFilter != null,
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

  const total = data?.coverage?.totalStudents ?? 0;
  const withLexile = data?.coverage?.withLexileData ?? 0;
  const withMath = data?.coverage?.withMathLevel ?? 0;
  const headline = `${data?.headline?.improvedPct ?? 0}% of students improved reading level`;

  const openWorklist = (filter: WorklistFilter) => {
    setWorklistFilter((prev) => (prev === filter ? null : filter));
  };

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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          className="cursor-pointer hover:border-blue-300 transition-colors"
          data-testid="kpi-lexile-coverage"
          onClick={() => openWorklist("lexile")}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">With Lexile</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{withLexile}</div>
            <p className="text-xs text-muted-foreground">
              of {total} — click for missing Lexile
            </p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:border-emerald-300 transition-colors"
          data-testid="kpi-math-level-coverage"
          onClick={() => openWorklist("math")}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">With Math Level</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{withMath}</div>
            <p className="text-xs text-muted-foreground">
              of {total} — click for missing Math Level
            </p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:border-amber-300 transition-colors"
          data-testid="kpi-missing-either"
          onClick={() => openWorklist("either")}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Missing levels</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Worklist</div>
            <p className="text-xs text-muted-foreground">Students missing Lexile or Math Level</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Improved this year</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {data?.headline?.improvedPct ?? 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              {data?.coverage?.withReadingData ?? 0} with reading data
            </p>
          </CardContent>
        </Card>
      </div>

      {worklistFilter && (
        <Card data-testid="missing-levels-worklist">
          <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-lg">
              Missing levels — {worklistFilter === "either" ? "Lexile or Math" : worklistFilter}
            </CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setWorklistFilter(null)}
              data-testid="button-close-missing-worklist"
            >
              Close
            </Button>
          </CardHeader>
          <CardContent>
            {missingLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !missingData?.students?.length ? (
              <p className="text-sm text-muted-foreground" data-testid="missing-levels-empty">
                Every student in this filter has the selected levels recorded.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Campus</TableHead>
                    <TableHead>Missing</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {missingData.students.map((s) => (
                    <TableRow key={s.childId} data-testid={`missing-level-row-${s.childId}`}>
                      <TableCell className="font-medium">
                        {s.firstName} {s.lastName}
                      </TableCell>
                      <TableCell>{s.gradeLevel || "—"}</TableCell>
                      <TableCell>{s.campus || "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {s.missing.map((m) => (
                            <Badge key={m} variant="secondary" className="text-xs capitalize">
                              {m}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/schools/students/${s.childId}`}>Enter on profile</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LiteracyCohortTrendChart
          data={(data?.monthlyTrends || []).map((m: { month: string; count: number }) => ({
            period: m.month,
            count: m.count,
          }))}
        />
        <MathLevelDistributionChart data={data?.mathLevelDistribution || []} />
      </div>

      <ProficiencyBandsChart bands={data?.proficiencyBands || []} />

      <ProgressChartExportCard
        schoolName={schoolName}
        schoolYear={schoolYear}
        headline={headline}
      >
        <div className="grid grid-cols-1 gap-4">
          <LiteracyCohortTrendChart
            data={(data?.monthlyTrends || []).map((m: { month: string; count: number }) => ({
              period: m.month,
              count: m.count,
            }))}
          />
          <ProficiencyBandsChart bands={data?.proficiencyBands || []} />
        </div>
      </ProgressChartExportCard>
    </div>
  );
}
