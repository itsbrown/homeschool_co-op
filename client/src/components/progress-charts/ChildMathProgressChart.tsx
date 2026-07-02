import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { safeFormatDate } from "@/utils/safeFormatDate";

interface MathPoint {
  date: string;
  lessonNumber: number | null;
  unitLabel: string | null;
  score?: string;
}

export function ChildMathProgressChart({ series }: { series: MathPoint[] }) {
  const withLessons = series.filter((s) => s.lessonNumber != null);
  if (withLessons.length < 2) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Log math lessons or record math assessments to see progress here.
        </CardContent>
      </Card>
    );
  }

  const chartData = withLessons.map((p) => ({
    date: safeFormatDate(p.date, "MMM d"),
    lesson: p.lessonNumber,
    unit: p.unitLabel || p.score,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Math Progress</CardTitle>
        <CardDescription>Lesson advancement over time</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={{ lesson: { label: "Lesson #", color: "hsl(var(--chart-3))" } }} className="h-72 w-full">
          <LineChart data={chartData}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line type="monotone" dataKey="lesson" stroke="var(--color-lesson)" strokeWidth={2} dot />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
