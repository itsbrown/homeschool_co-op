import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { fetchTopSellingItems } from "@/lib/api";

export default function MarketplaceAnalyticsCard() {
  const { data: topItems, isLoading } = useQuery({
    queryKey: ["/api/marketplace/top"],
    queryFn: () => fetchTopSellingItems(3),
  });

  const viewFullReport = () => {
    console.log("View full report");
  };

  // Format currency
  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  // Calculate percentage for progress bar (based on max revenue)
  const calculatePercentage = (items = []) => {
    if (items.length === 0) return [];
    
    const maxRevenue = Math.max(...items.map(item => item.revenue));
    
    return items.map(item => ({
      ...item,
      percentage: Math.round((item.revenue / maxRevenue) * 100)
    }));
  };

  const itemsWithPercentage = calculatePercentage(topItems || []);

  return (
    <Card>
      <CardHeader className="bg-muted/50 border-b">
        <CardTitle>Marketplace Analytics</CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-4">
          {isLoading ? (
            // Loading skeleton
            <>
              {[1, 2, 3].map((i) => (
                <div key={i}>
                  <div className="flex justify-between mb-1">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <Skeleton className="h-2 w-full rounded-full" />
                </div>
              ))}
            </>
          ) : itemsWithPercentage.length > 0 ? (
            // Marketplace item analytics
            itemsWithPercentage.map((item, index) => (
              <div key={item.id}>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium">{item.title}</span>
                  <span className="text-sm font-medium">{formatCurrency(item.revenue)}</span>
                </div>
                <Progress value={item.percentage} className="h-2" />
              </div>
            ))
          ) : (
            // Empty state
            <div className="text-center py-4">
              <p className="text-muted-foreground text-sm">No marketplace items yet</p>
            </div>
          )}
        </div>
        
        <div className="mt-6">
          <Button 
            variant="outline" 
            className="w-full"
            onClick={viewFullReport}
          >
            View Full Report
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
