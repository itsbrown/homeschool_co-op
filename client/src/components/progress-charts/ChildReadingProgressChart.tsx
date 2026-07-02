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
}: {
  series: ReadingPoint[];
  childGradeLevel?: string | null;
}) {
  if (series.length < 2) {
    return (
      <Card>
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

  const gradeNum = childGradeLevel ? parseFloat(childGradeLevel) : null;
  const bandLow = gradeNum != null ? 200 + gradeNum * 100 - 100 : null;
  const bandHigh = gradeNum != null ? 200 + gradeNum * 100 + 100 : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Reading Progress</CardTitle>
        <CardDescription>Lexile growth through the school year</CardDescription>
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
