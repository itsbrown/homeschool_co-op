import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/components/SupabaseProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { 
  Users, 
  MapPin,
  Search,
  Phone,
  Mail,
  GraduationCap,
  Calendar,
  Download,
  AlertTriangle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';
import { format } from 'date-fns';

interface Location {
  id: number;
  name: string;
  code: string;
}

interface EnrollmentWithContact {
  enrollmentId: number;
  studentId: number;
  studentFirstName: string;
  studentLastName: string;
  studentFullName: string;
  className: string;
  classId: number;
  enrollmentStatus: string;
  parentId: number;
  parentName: string;
  parentEmail: string;
  parentPhone: string | null;
  enrollmentDate: string | null;
}

interface EnrollmentResponse {
  location: Location;
  enrollments: EnrollmentWithContact[];
  meta: {
    totalCount: number;
    accessedAt: string;
  };
}

const statusColors: Record<string, string> = {
  enrolled: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  pending_payment: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  pending_admin_approval: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  waitlist: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};

export default function LocationEnrollmentsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: locations, isLoading: locationsLoading } = useQuery<Location[]>({
    queryKey: ['/api/locations'],
    enabled: !!user,
  });

  const { 
    data: enrollmentData, 
    isLoading: enrollmentsLoading,
    error: enrollmentsError 
  } = useQuery<EnrollmentResponse>({
    queryKey: ['/api/location-enrollments', selectedLocationId, 'enrollments'],
    enabled: !!selectedLocationId,
  });

  const filteredEnrollments = enrollmentData?.enrollments.filter((enrollment) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      enrollment.studentFullName.toLowerCase().includes(query) ||
      enrollment.parentName.toLowerCase().includes(query) ||
      enrollment.parentEmail.toLowerCase().includes(query) ||
      enrollment.className.toLowerCase().includes(query) ||
      (enrollment.parentPhone && enrollment.parentPhone.includes(query))
    );
  });

  const handleExportCSV = () => {
    if (!filteredEnrollments) return;

    const headers = [
      'Student Name',
      'Class',
      'Status',
      'Parent Name',
      'Parent Email',
      'Parent Phone',
      'Enrollment Date'
    ];

    const rows = filteredEnrollments.map((e) => [
      e.studentFullName,
      e.className,
      e.enrollmentStatus,
      e.parentName,
      e.parentEmail,
      e.parentPhone || '',
      e.enrollmentDate ? format(new Date(e.enrollmentDate), 'yyyy-MM-dd') : ''
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `enrollments-${enrollmentData?.location.code}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: 'Export complete',
      description: `Exported ${filteredEnrollments.length} enrollment records`,
    });
  };

  if (locationsLoading) {
    return (
      <SchoolAdminLayout pageTitle="Location Enrollments">
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      </SchoolAdminLayout>
    );
  }

  return (
    <SchoolAdminLayout pageTitle="Location Enrollments">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6" />
              Location Enrollments
            </h1>
            <p className="text-muted-foreground mt-1">
              View enrolled students and parent contact information
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Select Location
            </CardTitle>
            <CardDescription>
              Choose a location to view enrollments
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {locations?.map((location) => (
                <Button
                  key={location.id}
                  variant={selectedLocationId === location.id ? 'default' : 'outline'}
                  onClick={() => setSelectedLocationId(location.id)}
                  data-testid={`location-select-${location.id}`}
                >
                  {location.name}
                  <Badge variant="secondary" className="ml-2">
                    {location.code}
                  </Badge>
                </Button>
              ))}
              {(!locations || locations.length === 0) && (
                <p className="text-muted-foreground">No locations available</p>
              )}
            </div>
          </CardContent>
        </Card>

        {selectedLocationId && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <GraduationCap className="h-5 w-5" />
                    Enrollments
                    {enrollmentData && (
                      <Badge variant="outline" className="ml-2">
                        {enrollmentData.meta.totalCount} total
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    Students enrolled at {enrollmentData?.location.name || 'this location'}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search students, parents, classes..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 w-64"
                      data-testid="search-input"
                    />
                  </div>
                  <Button 
                    variant="outline" 
                    onClick={handleExportCSV}
                    disabled={!filteredEnrollments || filteredEnrollments.length === 0}
                    data-testid="export-button"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {enrollmentsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : enrollmentsError ? (
                <div className="text-center py-8">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-destructive" />
                  <p className="text-destructive font-medium">Access Denied</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    You do not have permission to view parent contacts at this location.
                    Contact your administrator for access.
                  </p>
                </div>
              ) : filteredEnrollments && filteredEnrollments.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Class</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Parent</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Enrolled</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEnrollments.map((enrollment) => (
                        <TableRow key={enrollment.enrollmentId} data-testid={`enrollment-row-${enrollment.enrollmentId}`}>
                          <TableCell>
                            <div className="font-medium">{enrollment.studentFullName}</div>
                          </TableCell>
                          <TableCell>{enrollment.className}</TableCell>
                          <TableCell>
                            <Badge className={statusColors[enrollment.enrollmentStatus] || ''}>
                              {enrollment.enrollmentStatus.replace(/_/g, ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>{enrollment.parentName}</TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <a 
                                href={`mailto:${enrollment.parentEmail}`}
                                className="flex items-center gap-1 text-sm text-primary hover:underline"
                                data-testid={`email-link-${enrollment.enrollmentId}`}
                              >
                                <Mail className="h-3 w-3" />
                                {enrollment.parentEmail}
                              </a>
                              {enrollment.parentPhone && (
                                <a 
                                  href={`tel:${enrollment.parentPhone}`}
                                  className="flex items-center gap-1 text-sm text-primary hover:underline"
                                  data-testid={`phone-link-${enrollment.enrollmentId}`}
                                >
                                  <Phone className="h-3 w-3" />
                                  {enrollment.parentPhone}
                                </a>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {enrollment.enrollmentDate ? (
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(enrollment.enrollmentDate), 'MMM d, yyyy')}
                              </div>
                            ) : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No enrollments found at this location</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </SchoolAdminLayout>
  );
}
