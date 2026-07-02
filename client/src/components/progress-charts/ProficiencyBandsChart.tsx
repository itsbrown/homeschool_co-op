import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Cell, Pie, PieChart } from "recharts";

const COLORS = ["hsl(var(--chart-4))", "hsl(var(--chart-2))", "hsl(var(--chart-1))"];

interface Band {
  band: string;
  count: number;
  pct: number;
}

const bandLabel: Record<string, string> = {
  below: "Below grade band",
  at: "On track",
  above: "Above grade band",
};

export function ProficiencyBandsChart({ bands }: { bands: Band[] }) {
  const data = bands
    .filter((b) => b.count > 0)
    .map((b) => ({ name: bandLabel[b.band] || b.band, value: b.count, pct: b.pct }));

  if (!data.length) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Not enough Lexile data to show proficiency bands.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Reading Proficiency</CardTitle>
        <CardDescription>Compared to expected Lexile for grade level</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={{ value: { label: "Students" } }}
          className="mx-auto h-64 w-full max-w-md"
        >
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
