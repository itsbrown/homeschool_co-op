import { Card, CardContent } from "@/components/ui/card";
import { ReactNode } from "react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  change: {
    value: string;
    isPositive: boolean;
  };
}

export default function StatCard({ title, value, icon, change }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-semibold text-foreground">{value}</p>
          </div>
          <div className="w-12 h-12 bg-primary/10 flex items-center justify-center rounded-lg text-primary">
            {icon}
          </div>
        </div>
        <div className="mt-4 flex items-center text-sm">
          <span className={`font-medium ${change.isPositive ? 'text-success' : 'text-destructive'}`}>
            {change.value}
          </span>
          <span className="text-muted-foreground ml-2">from last month</span>
        </div>
      </CardContent>
    </Card>
  );
}
