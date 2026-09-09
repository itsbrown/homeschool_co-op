import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

const chartConfig = {
  count: { label: "Students", color: "hsl(var(--chart-2))" },
};

interface DistPoint {
  level: string;
  count: number;
}

export function MathLevelDistributionChart({ data }: { data: DistPoint[] }) {
  if (!data.length) {
    return (
      <Card data-testid="math-level-distribution-empty">
        <CardHeader>
          <CardTitle className="text-lg">Math Level distribution</CardTitle>
          <CardDescription>Current Dimensions / grade-equivalent placements</CardDescription>
        </CardHeader>
        <CardContent className="pt-2 text-sm text-muted-foreground">
          No math levels recorded yet. Enter levels on student profiles to see distribution.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="math-level-distribution-chart">
      <CardHeader>
        <CardTitle className="text-lg">Math Level distribution</CardTitle>
        <CardDescription>Current Dimensions / grade-equivalent placements</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-64 w-full">
          <BarChart data={data}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="level" tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" fill="var(--color-count)" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
