import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
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
import { Badge } from "@/components/ui/badge";

const STEP_LABELS: Record<string, string> = {
  add_to_cart: "Add to cart",
  view_cart: "View cart",
  begin_checkout: "Begin checkout",
  add_payment_info: "Payment info",
  purchase: "Purchase",
  abandon: "Abandoned",
};

interface CartAbandonmentTabProps {
  locations: { id: number; name: string }[];
}

export function CartAbandonmentTab({ locations }: CartAbandonmentTabProps) {
  const [filters, setFilters] = useState<AnalyticsFilterValues>(defaultAnalyticsFilters);
  const query = buildAnalyticsQuery(filters);

  const { data, isLoading, error } = useQuery({
    queryKey: [`/api/school-analytics/cart-abandonment${query}`],
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
        <CardContent className="pt-6 text-destructive">Failed to load cart abandonment data.</CardContent>
      </Card>
    );
  }

  const funnel = (data?.funnel || []).map((f: any) => ({
    ...f,
    label: STEP_LABELS[f.step] || f.step,
  }));

  const formatMoney = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

  return (
    <div className="space-y-6">
      <AnalyticsFilterBar filters={filters} onChange={setFilters} locations={locations} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Abandoned carts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.summary?.totalAbandoned ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Revenue at risk</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {formatMoney(data?.summary?.totalValueCents ?? 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Abandonment rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.summary?.abandonmentRate ?? 0}%</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Checkout funnel</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{ count: { label: "Sessions", color: "hsl(var(--chart-1))" } }}
            className="h-64 w-full"
          >
            <BarChart data={funnel}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={4} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Abandoned carts</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Parent</TableHead>
                <TableHead>Children</TableHead>
                <TableHead>Classes</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Last step</TableHead>
                <TableHead>Lane</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.abandoned || []).map((row: any) => (
                <TableRow key={row.correlationId}>
                  <TableCell>
                    <div className="font-medium">{row.parentName || "—"}</div>
                    <div className="text-xs text-muted-foreground">{row.parentEmail}</div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.children?.map((c: any) => c.name).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.classes?.map((c: any) => c.name).join(", ") || "—"}
                  </TableCell>
                  <TableCell>{formatMoney(row.cartValueCents)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{STEP_LABELS[row.lastStep] || row.lastStep}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{row.lane}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!data?.abandoned?.length && (
            <p className="text-sm text-muted-foreground py-4">No abandoned carts in this period.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
