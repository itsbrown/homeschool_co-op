import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { MapPin, Users, DollarSign } from 'lucide-react';

interface LocationStat {
  locationId: number;
  locationName: string;
  address: string | null;
  classCount: number;
  enrollmentCount: number;
  revenue: number;
}

interface LocationStatsResponse {
  locationStats: LocationStat[];
}

const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
};

export function LocationAnalyticsChart() {
  const { data, isLoading, error } = useQuery<LocationStatsResponse>({
    queryKey: ['/api/analytics/school/location-stats'],
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-destructive" data-testid="error-location-stats">Failed to load location data</p>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.locationStats.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Location Analytics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground" data-testid="text-no-locations">No location data available</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.locationStats.map(loc => ({
    name: loc.locationName.length > 15 ? loc.locationName.slice(0, 15) + '...' : loc.locationName,
    fullName: loc.locationName,
    classes: loc.classCount,
    enrollments: loc.enrollmentCount,
    revenue: loc.revenue / 100,
  }));

  const totalEnrollments = data.locationStats.reduce((sum, loc) => sum + loc.enrollmentCount, 0);
  const totalRevenue = data.locationStats.reduce((sum, loc) => sum + loc.revenue, 0);
  const totalClasses = data.locationStats.reduce((sum, loc) => sum + loc.classCount, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              Locations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-locations">
              {data.locationStats.length}
            </div>
            <p className="text-xs text-muted-foreground">{totalClasses} total classes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Total Enrollments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-location-enrollments">
              {totalEnrollments}
            </div>
            <p className="text-xs text-muted-foreground">Across all locations</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              Total Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-location-revenue">
              {formatCurrency(totalRevenue)}
            </div>
            <p className="text-xs text-muted-foreground">From all locations</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Enrollments by Location
          </CardTitle>
          <CardDescription>Classes and enrollments per location</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64" data-testid="chart-location-enrollments">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={120} />
                <Tooltip 
                  formatter={(value, name) => [
                    name === 'revenue' ? formatCurrency(Number(value) * 100) : value,
                    name === 'classes' ? 'Classes' : name === 'enrollments' ? 'Enrollments' : 'Revenue'
                  ]}
                />
                <Legend />
                <Bar dataKey="classes" fill="#6366F1" name="Classes" />
                <Bar dataKey="enrollments" fill="#10B981" name="Enrollments" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Location Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3" data-testid="list-location-details">
            {data.locationStats.map((loc) => (
              <div 
                key={loc.locationId} 
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                data-testid={`location-item-${loc.locationId}`}
              >
                <div>
                  <p className="font-medium">{loc.locationName}</p>
                  {loc.address && (
                    <p className="text-sm text-muted-foreground">{loc.address}</p>
                  )}
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <div className="text-center">
                    <p className="font-semibold">{loc.classCount}</p>
                    <p className="text-muted-foreground">Classes</p>
                  </div>
                  <div className="text-center">
                    <p className="font-semibold">{loc.enrollmentCount}</p>
                    <p className="text-muted-foreground">Enrolled</p>
                  </div>
                  <div className="text-center">
                    <p className="font-semibold">{formatCurrency(loc.revenue)}</p>
                    <p className="text-muted-foreground">Revenue</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
