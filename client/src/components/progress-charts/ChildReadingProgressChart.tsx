import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Line, LineChart, CartesianGrid, XAxis, YAxis, ReferenceArea } from "recharts";
import { safeFormatDate } from "@/utils/safeFormatDate";

interface ReadingPoint {
  date: string;
  lexile: number | null;
  gradeLevel: number | null;
  label?: string;
}

export function ChildReadingProgressChart({
  series,
  childGradeLevel,
  bandAtMin,
  bandAtMax,
  jurisdictionName,
}: {
  series: ReadingPoint[];
  childGradeLevel?: string | null;
  /** Jurisdiction KPI band; when omitted falls back to ASA heuristic from grade. */
  bandAtMin?: number | null;
  bandAtMax?: number | null;
  jurisdictionName?: string | null;
}) {
  if (series.length < 2) {
    return (
      <Card data-testid="child-reading-progress-empty">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          At least 2 reading data points are needed to show a progress chart.
        </CardContent>
      </Card>
    );
  }

  const chartData = series.map((p) => ({
    date: safeFormatDate(p.date, "MMM d, yyyy"),
    lexile: p.lexile,
    tooltip: p.label,
  }));

  let bandLow = bandAtMin ?? null;
  let bandHigh = bandAtMax ?? null;
  if (bandLow == null || bandHigh == null) {
    const gradeNum = childGradeLevel ? parseFloat(childGradeLevel) : null;
    if (gradeNum != null && Number.isFinite(gradeNum)) {
      bandLow = 200 + gradeNum * 100 - 100;
      bandHigh = 200 + gradeNum * 100 + 100;
    }
  }

  const bandLabel = jurisdictionName
    ? `Compared to ${jurisdictionName} expected Lexile for grade`
    : "Lexile growth through the school year";

  return (
    <Card data-testid="child-reading-progress-chart">
      <CardHeader>
        <CardTitle className="text-lg">Reading Progress</CardTitle>
        <CardDescription>{bandLabel}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={{ lexile: { label: "Lexile", color: "hsl(var(--chart-1))" } }} className="h-72 w-full">
          <LineChart data={chartData}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} domain={["auto", "auto"]} />
            {bandLow != null && bandHigh != null && (
              <ReferenceArea y1={bandLow} y2={bandHigh} fill="hsl(var(--chart-2))" fillOpacity={0.15} />
            )}
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line type="monotone" dataKey="lexile" stroke="var(--color-lexile)" strokeWidth={2} dot />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
