import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { safeFormatDate } from "@/utils/safeFormatDate";

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export type StudentSeries = {
  childId: number;
  label: string;
  series: { date: string; lexile: number | null }[];
};

export function MultiStudentLexileChart({ students }: { students: StudentSeries[] }) {
  if (!students.length) {
    return (
      <Card data-testid="multi-student-lexile-empty">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Select students to compare Lexile progress.
        </CardContent>
      </Card>
    );
  }

  const dateSet = new Set<string>();
  for (const s of students) {
    for (const p of s.series) {
      if (p.lexile != null) dateSet.add(p.date);
    }
  }
  const dates = Array.from(dateSet).sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime(),
  );

  if (dates.length < 2 && students.every((s) => s.series.filter((p) => p.lexile != null).length < 2)) {
    return (
      <Card data-testid="multi-student-lexile-empty">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          At least 2 reading data points are needed per student to compare.
        </CardContent>
      </Card>
    );
  }

  const chartData = dates.map((d) => {
    const row: Record<string, string | number | null> = {
      date: safeFormatDate(d, "MMM d, yyyy"),
    };
    for (const s of students) {
      const point = s.series.find((p) => p.date === d || String(p.date) === String(d));
      row[`s${s.childId}`] = point?.lexile ?? null;
    }
    return row;
  });

  const config: Record<string, { label: string; color: string }> = {};
  students.forEach((s, i) => {
    config[`s${s.childId}`] = {
      label: s.label,
      color: COLORS[i % COLORS.length],
    };
  });

  return (
    <Card data-testid="multi-student-lexile-chart">
      <CardHeader>
        <CardTitle className="text-lg">Compare Students</CardTitle>
        <CardDescription>Lexile growth for selected students</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-72 w-full">
          <LineChart data={chartData}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} domain={["auto", "auto"]} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            {students.map((s, i) => (
              <Line
                key={s.childId}
                type="monotone"
                dataKey={`s${s.childId}`}
                name={s.label}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot
                connectNulls
              />
            ))}
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
