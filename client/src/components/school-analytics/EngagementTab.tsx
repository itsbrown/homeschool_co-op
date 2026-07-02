import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Line, LineChart, CartesianGrid, XAxis, YAxis, Bar, BarChart } from "recharts";
import {
  AnalyticsFilterBar,
  buildAnalyticsQuery,
  defaultAnalyticsFilters,
  type AnalyticsFilterValues,
} from "./AnalyticsFilterBar";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface EngagementTabProps {
  locations: { id: number; name: string }[];
}

export function EngagementTab({ locations }: EngagementTabProps) {
  const [filters, setFilters] = useState<AnalyticsFilterValues>(defaultAnalyticsFilters);
  const query = buildAnalyticsQuery(filters);

  const { data, isLoading, error } = useQuery({
    queryKey: [`/api/school-analytics/engagement${query}`],
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
        <CardContent className="pt-6 text-destructive">Failed to load engagement data.</CardContent>
      </Card>
    );
  }

  const summary = data?.summary;
  const dailyTrend = data?.dailyTrend || [];

  return (
    <div className="space-y-6">
      <AnalyticsFilterBar filters={filters} onChange={setFilters} locations={locations} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active parents (period)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.activeParents ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Page views</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalPageViews ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg session</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.avgSessionMinutes ?? 0} min</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Daily active (latest)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.dau ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Parent logins over time</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{ activeParents: { label: "Active parents", color: "hsl(var(--chart-1))" } }}
            className="h-64 w-full"
          >
            <LineChart data={dailyTrend}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line type="monotone" dataKey="activeParents" stroke="var(--color-activeParents)" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <BreakdownCard title="By location" data={data?.breakdownByLocation || []} />
        <BreakdownCard title="By grade" data={data?.breakdownByGrade || []} />
        <BreakdownCard title="By gender" data={data?.breakdownByGender || []} />
        <BreakdownCard title="By age band" data={data?.breakdownByAge || []} />
      </div>

      {(data?.atRisk?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">At-risk parents</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Parent</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Last login</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.atRisk.map((row: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell>{row.parentName}</TableCell>
                    <TableCell>{row.parentEmail}</TableCell>
                    <TableCell>{row.lastLogin ? new Date(row.lastLogin).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BreakdownCard({ title, data }: { title: string; data: { key: string; count: number }[] }) {
  if (!data.length) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={{ count: { label: "Parents", color: "hsl(var(--chart-2))" } }} className="h-48 w-full">
          <BarChart data={data} layout="vertical">
            <XAxis type="number" hide />
            <YAxis dataKey="key" type="category" width={80} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" fill="var(--color-count)" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
