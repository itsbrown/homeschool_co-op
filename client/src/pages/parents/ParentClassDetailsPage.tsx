import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import ParentAppShell from "@/components/layout/ParentAppShell";
import { 
  ArrowLeft, 
  CalendarIcon, 
  Clock, 
  MapPin, 
  Users,
  DollarSign,
  BookOpen,
  GraduationCap
} from "lucide-react";

// Format currency - converts cents to dollars
const formatCurrency = (value: number | string | undefined, includeCents: boolean = true): string => {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (!numValue && numValue !== 0) return 'N/A';
  
  // Convert cents to dollars
  const dollarValue = numValue / 100;
  
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: includeCents ? 2 : 0,
    maximumFractionDigits: includeCents ? 2 : 0,
  });
  
  return formatter.format(dollarValue);
};

// Format date
const formatDate = (date: string | undefined) => {
  if (!date) return 'N/A';
  try {
    return new Date(date).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  } catch {
    return date;
  }
};

export default function ParentClassDetailsPage() {
  const [, navigate] = useLocation();
  const [match, params] = useRoute("/parent/classes/:id");
  const classId = params?.id;

  // Fetch class details
  const { data: classData, isLoading, isError, error } = useQuery({
    queryKey: ["/api/class-details", classId],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      const response = await fetch(`/api/class-details/${classId}`, {
        headers: {
          ...(token && { Authorization: `Bearer ${token}` })
        },
        credentials: "include"
      });
      if (!response.ok) throw new Error("Failed to fetch class");
      return response.json();
    },
    enabled: !!classId,
  });

  if (isLoading) {
    return (
      <ParentAppShell>
        <div className="space-y-6 p-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </ParentAppShell>
    );
  }

  if (isError) {
    return (
      <ParentAppShell>
        <div className="text-center py-12 px-6">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Error Loading Class</h2>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            {error instanceof Error ? error.message : "There was a problem loading the class details."}
          </p>
          <Button 
            className="mt-4"
            onClick={() => navigate("/parent/programs")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Classes
          </Button>
        </div>
      </ParentAppShell>
    );
  }

  if (!classData) {
    return (
      <ParentAppShell>
        <div className="text-center py-12 px-6">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Class Not Found</h2>
          <p className="text-gray-600 dark:text-gray-400 mt-2">The class you're looking for doesn't exist.</p>
          <Button 
            className="mt-4"
            onClick={() => navigate("/parent/programs")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Classes
          </Button>
        </div>
      </ParentAppShell>
    );
  }

  // Check for variants directly from API first
  let variants = classData.variants;
  
  // If no direct variants, try parsing from schedule field
  if (!variants) {
    let scheduleData = classData.schedule;
    
    // Parse JSON string if needed
    if (typeof scheduleData === 'string') {
      try {
        scheduleData = JSON.parse(scheduleData);
      } catch (e) {
        scheduleData = null;
      }
    }
    
    if (scheduleData?.variants) {
      variants = scheduleData.variants;
    }
  }

  return (
    <ParentAppShell>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button 
            variant="outline" 
            onClick={() => navigate("/parent/programs")}
            data-testid="button-back-to-classes"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Classes
          </Button>
        </div>

        {/* Class Title */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100" data-testid="text-class-title">
            {classData.title}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant={classData.category === "academic" ? "default" : "secondary"} data-testid="badge-category">
              {classData.categoryName || classData.category}
            </Badge>
          </div>
        </div>

        {/* Price Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Price
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-primary" data-testid="text-price">
              {formatCurrency(classData.price, false)}
            </p>
          </CardContent>
        </Card>

        {/* Description */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Description
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed" data-testid="text-description">
              {classData.description || "No description provided"}
            </p>
          </CardContent>
        </Card>

        {/* Time Options / Variants */}
        {variants && variants.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Available Time Options
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {variants.map((variant: any, index: number) => (
                  <div 
                    key={variant.id || index} 
                    className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-800"
                    data-testid={`card-variant-${index}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-semibold text-lg">{variant.name}</h4>
                      {variant.price && (
                        <span className="text-lg font-bold text-primary">
                          {formatCurrency(variant.price, false)}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                      {variant.days && variant.days.length > 0 && (
                        <p><strong>Days:</strong> {variant.days.join(', ')}</p>
                      )}
                      {variant.startTime && variant.endTime && (
                        <p><strong>Time:</strong> {variant.startTime} - {variant.endTime}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Class Dates */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              Class Dates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm text-gray-500 dark:text-gray-400">Start Date</Label>
                <p className="text-lg font-semibold" data-testid="text-start-date">
                  {formatDate(classData.startDate)}
                </p>
              </div>
              <div>
                <Label className="text-sm text-gray-500 dark:text-gray-400">End Date</Label>
                <p className="text-lg font-semibold" data-testid="text-end-date">
                  {formatDate(classData.endDate)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Class Capacity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Class Capacity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm text-gray-500 dark:text-gray-400">Enrolled</Label>
                  <p className="text-2xl font-bold" data-testid="text-enrolled-count">
                    {classData.totalOrders || 0}
                  </p>
                </div>
                <div>
                  <Label className="text-sm text-gray-500 dark:text-gray-400">Capacity</Label>
                  <p className="text-2xl font-bold" data-testid="text-capacity">
                    {classData.capacity || classData.maxStudents || 'N/A'}
                  </p>
                </div>
                <div>
                  <Label className="text-sm text-gray-500 dark:text-gray-400">Spots Left</Label>
                  {(() => {
                    const capacity = classData.capacity || classData.maxStudents;
                    if (!capacity) return <p className="text-2xl font-bold" data-testid="text-spots-left">N/A</p>;
                    const spotsLeft = Math.max(0, capacity - (classData.totalOrders || 0));
                    const colorClass = spotsLeft === 0 ? 'text-red-600' : spotsLeft <= 3 ? 'text-amber-600' : 'text-green-600';
                    return (
                      <p className={`text-2xl font-bold ${colorClass}`} data-testid="text-spots-left">
                        {spotsLeft}
                      </p>
                    );
                  })()}
                </div>
              </div>

              {/* Waitlist Information */}
              {classData.totalWaitlisted > 0 && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800">
                  <span className="text-sm text-amber-700 dark:text-amber-300">
                    <strong>{classData.totalWaitlisted}</strong> students on waitlist
                  </span>
                </div>
              )}

              {/* Low Availability Warning */}
              {(() => {
                const capacity = classData.capacity || classData.maxStudents;
                if (!capacity) return null;
                const spotsLeft = Math.max(0, capacity - (classData.totalOrders || 0));
                if (spotsLeft === 0) {
                  return (
                    <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
                      <span className="text-sm text-red-700 dark:text-red-300 font-medium">
                        This class is currently full
                      </span>
                    </div>
                  );
                }
                if (spotsLeft <= 3) {
                  return (
                    <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800">
                      <span className="text-sm text-amber-700 dark:text-amber-300 font-semibold">
                        Only {spotsLeft} {spotsLeft === 1 ? 'spot' : 'spots'} remaining — enroll soon!
                      </span>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          </CardContent>
        </Card>

        {/* Location */}
        {classData.location && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Location
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700 dark:text-gray-300" data-testid="text-location">
                {classData.location}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Class Roster */}
        <ClassRosterSection classId={classId} />

        {/* Enroll Now Button - Sticky on mobile */}
        <div className="sticky bottom-0 bg-background border-t p-4 -mx-6 mt-6 flex justify-end gap-3 md:relative md:border-0 md:p-0 md:mx-0 md:mt-0 md:bg-transparent">
          {(() => {
            const capacity = classData.capacity || classData.maxStudents;
            const isFull = capacity && (classData.totalOrders || 0) >= capacity;
            if (isFull) {
              return (
                <Button 
                  size="lg"
                  variant="secondary"
                  disabled
                  className="w-full md:w-auto"
                  data-testid="button-enroll-now"
                >
                  Class Full
                </Button>
              );
            }
            return (
              <Button 
                size="lg"
                className="w-full md:w-auto"
                onClick={() => navigate(`/parent/programs?enroll=${classId}`)}
                data-testid="button-enroll-now"
              >
                Enroll Now
              </Button>
            );
          })()}
        </div>
      </div>
    </ParentAppShell>
  );
}

function ClassRosterSection({ classId }: { classId: string | undefined }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["/api/parent/class-roster", classId],
    queryFn: async () => {
      const token = localStorage.getItem('supabase_token');
      const response = await fetch(`/api/parent/class-roster/${classId}`, {
        headers: {
          ...(token && { Authorization: `Bearer ${token}` })
        },
        credentials: "include"
      });
      if (!response.ok) {
        if (response.status === 403) return null;
        throw new Error("Failed to fetch roster");
      }
      return response.json();
    },
    enabled: !!classId,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Class Roster
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-6 w-44" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError || !data || !data.students || data.students.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Class Roster
        </CardTitle>
        <CardDescription>
          {data.totalStudents} {data.totalStudents === 1 ? 'student' : 'students'} enrolled
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          {data.students.map((student: any, index: number) => (
            <div
              key={index}
              className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800"
              data-testid={`roster-student-${index}`}
            >
              <GraduationCap className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <span className="text-sm font-medium">
                {student.firstName} {student.lastInitial}
              </span>
              {student.gradeLevel && (
                <Badge variant="outline" className="text-xs ml-auto">
                  {student.gradeLevel}
                </Badge>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
