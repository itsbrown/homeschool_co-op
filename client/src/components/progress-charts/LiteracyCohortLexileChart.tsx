import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";

interface TrendPoint {
  period: string;
  medianLexile: number | null;
  count: number;
}

export function LiteracyCohortLexileChart({ data }: { data: TrendPoint[] }) {
  const chartData = data.filter((d) => d.medianLexile != null);

  if (!chartData.length) {
    return (
      <Card data-testid="cohort-lexile-chart-empty">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Not enough Lexile data for a cohort trend line.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="cohort-lexile-chart">
      <CardHeader>
        <CardTitle className="text-lg">Cohort Lexile Trend</CardTitle>
        <CardDescription>Monthly median Lexile across students with reading data</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={{ medianLexile: { label: "Median Lexile", color: "hsl(var(--chart-1))" } }}
          className="h-64 w-full"
        >
          <LineChart data={chartData}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="period" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} domain={["auto", "auto"]} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line
              type="monotone"
              dataKey="medianLexile"
              stroke="var(--color-medianLexile)"
              strokeWidth={2}
              dot
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
