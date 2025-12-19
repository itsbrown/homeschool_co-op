import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

interface EnrollmentBreakdown {
  totalEnrollments: number;
  statusBreakdown: Record<string, number>;
  paymentBreakdown: { paid: number; pending: number };
  monthlyTrends: { month: string; count: number }[];
}

const STATUS_COLORS: Record<string, string> = {
  enrolled: '#10B981',
  pending: '#F59E0B',
  pending_admin_approval: '#8B5CF6',
  cancelled: '#EF4444',
  completed: '#3B82F6',
  waitlisted: '#6B7280',
  unknown: '#9CA3AF',
};

const PAYMENT_COLORS = {
  paid: '#10B981',
  pending: '#F59E0B',
};

export function EnrollmentBreakdownChart() {
  const { data, isLoading, error } = useQuery<EnrollmentBreakdown>({
    queryKey: ['/api/analytics/school/enrollment-breakdown'],
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-destructive" data-testid="error-enrollment-breakdown">Failed to load enrollment data</p>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const statusData = Object.entries(data.statusBreakdown).map(([status, count]) => ({
    name: status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    value: count,
    color: STATUS_COLORS[status] || STATUS_COLORS.unknown,
  }));

  const paymentData = [
    { name: 'Paid', value: data.paymentBreakdown.paid, color: PAYMENT_COLORS.paid },
    { name: 'Pending', value: data.paymentBreakdown.pending, color: PAYMENT_COLORS.pending },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Total Enrollments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-total-enrollments">
              {data.totalEnrollments}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Enrollment Status</CardTitle>
            <CardDescription>By status type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-48" data-testid="chart-enrollment-status">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Payment Status</CardTitle>
            <CardDescription>Paid vs pending</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-48" data-testid="chart-payment-status">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={paymentData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                  >
                    {paymentData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Monthly Enrollment Trends</CardTitle>
          <CardDescription>Last 6 months</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64" data-testid="chart-monthly-trends">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.monthlyTrends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#3B82F6" name="Enrollments" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
