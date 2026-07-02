import { useQuery } from "@tanstack/react-query";
import SchoolAdminLayout from "@/components/layout/SchoolAdminLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EngagementTab } from "@/components/school-analytics/EngagementTab";
import { CartAbandonmentTab } from "@/components/school-analytics/CartAbandonmentTab";
import ProgressInsightsTab from "@/components/admin/ProgressInsightsTab";

export default function SchoolAnalyticsPage() {
  const { data: school } = useQuery<{ name: string }>({
    queryKey: ["/api/school-admin/my-school"],
  });

  const { data: locations = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/locations"],
  });

  return (
    <SchoolAdminLayout pageTitle="School Analytics">
      <div className="container mx-auto p-4 max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">School Analytics</h1>
          <p className="text-muted-foreground text-sm">
            Engagement, cart abandonment, and student progress — filterable by location, grade, age, and gender.
          </p>
        </div>

        <Tabs defaultValue="engagement" data-testid="school-analytics-tabs">
          <TabsList>
            <TabsTrigger value="engagement" data-testid="tab-school-analytics-engagement">Engagement</TabsTrigger>
            <TabsTrigger value="cart" data-testid="tab-school-analytics-cart">Cart Abandonment</TabsTrigger>
            <TabsTrigger value="progress" data-testid="tab-school-analytics-progress">Student Progress</TabsTrigger>
          </TabsList>

          <TabsContent value="engagement" className="mt-6">
            <EngagementTab locations={locations} />
          </TabsContent>

          <TabsContent value="cart" className="mt-6">
            <CartAbandonmentTab locations={locations} />
          </TabsContent>

          <TabsContent value="progress" className="mt-6">
            <ProgressInsightsTab schoolName={school?.name} />
          </TabsContent>
        </Tabs>
      </div>
    </SchoolAdminLayout>
  );
}
