import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BookOpen, Users, TrendingUp, DollarSign } from 'lucide-react';

interface ClassEnrollment {
  classId: number;
  className: string;
  category: string | null;
  capacity: number;
  currentEnrollments: number;
  availableSpots: number;
  fillRate: number;
  variantBreakdown: Record<string, number>;
  totalRevenue: number;
}

interface ClassEnrollmentsResponse {
  classEnrollments: ClassEnrollment[];
}

const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
};

const getFillRateColor = (rate: number) => {
  if (rate >= 90) return 'text-red-500';
  if (rate >= 70) return 'text-orange-500';
  if (rate >= 50) return 'text-yellow-500';
  return 'text-green-500';
};

const getFillRateBadge = (rate: number) => {
  if (rate >= 100) return 'Full';
  if (rate >= 90) return 'Almost Full';
  if (rate >= 70) return 'Filling Up';
  return 'Available';
};

const getFillRateBadgeVariant = (rate: number): 'destructive' | 'secondary' | 'outline' | 'default' => {
  if (rate >= 100) return 'destructive';
  if (rate >= 90) return 'secondary';
  if (rate >= 70) return 'outline';
  return 'default';
};

export function ClassEnrollmentTable() {
  const { data, isLoading, error } = useQuery<ClassEnrollmentsResponse>({
    queryKey: ['/api/analytics/school/class-enrollments'],
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
          <p className="text-destructive" data-testid="error-class-enrollments">Failed to load class enrollment data</p>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.classEnrollments.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Class Enrollments
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground" data-testid="text-no-classes">No class data available</p>
        </CardContent>
      </Card>
    );
  }

  const totalEnrollments = data.classEnrollments.reduce((sum, c) => sum + c.currentEnrollments, 0);
  const totalRevenue = data.classEnrollments.reduce((sum, c) => sum + c.totalRevenue, 0);
  const avgFillRate = data.classEnrollments.length > 0
    ? Math.round(data.classEnrollments.reduce((sum, c) => sum + c.fillRate, 0) / data.classEnrollments.length)
    : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              Total Classes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-classes">
              {data.classEnrollments.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Total Enrolled
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-class-enrollments">
              {totalEnrollments}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Avg Fill Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getFillRateColor(avgFillRate)}`} data-testid="text-avg-fill-rate">
              {avgFillRate}%
            </div>
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
            <div className="text-2xl font-bold" data-testid="text-class-revenue">
              {formatCurrency(totalRevenue)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Class Enrollment Details
          </CardTitle>
          <CardDescription>Enrollment counts and variant breakdown per class</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto" data-testid="table-class-enrollments">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-center">Enrolled / Capacity</TableHead>
                  <TableHead className="text-center">Fill Rate</TableHead>
                  <TableHead>Variants</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.classEnrollments.map((classItem) => (
                  <TableRow key={classItem.classId} data-testid={`row-class-${classItem.classId}`}>
                    <TableCell className="font-medium">{classItem.className}</TableCell>
                    <TableCell>
                      {classItem.category ? (
                        <Badge variant="outline">{classItem.category}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="font-semibold">{classItem.currentEnrollments}</span>
                      <span className="text-muted-foreground"> / {classItem.capacity || '∞'}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-center gap-1">
                        <Progress 
                          value={Math.min(classItem.fillRate, 100)} 
                          className="w-16 h-2" 
                        />
                        <Badge variant={getFillRateBadgeVariant(classItem.fillRate)}>
                          {getFillRateBadge(classItem.fillRate)}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(classItem.variantBreakdown).map(([variant, count]) => (
                          <Badge key={variant} variant="secondary" className="text-xs">
                            {variant}: {count}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(classItem.totalRevenue)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
