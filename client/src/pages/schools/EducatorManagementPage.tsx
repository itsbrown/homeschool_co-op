import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRoute, useLocation } from 'wouter';
import { 
  Calendar, 
  Clock, 
  User, 
  BookOpen, 
  PlusCircle, 
  Edit, 
  Trash2, 
  ArrowLeft,
  ChevronRight,
  Timer,
  FileText
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import SchoolAdminLayout from '@/components/layout/SchoolAdminLayout';

const DAYS_OF_WEEK = [
  { value: '0', label: 'Monday' },
  { value: '1', label: 'Tuesday' },
  { value: '2', label: 'Wednesday' },
  { value: '3', label: 'Thursday' },
  { value: '4', label: 'Friday' },
  { value: '5', label: 'Saturday' },
  { value: '6', label: 'Sunday' },
];

interface EducatorSchedule {
  id: number;
  assignmentId: number;
  educatorId: number;
  classId: number;
  className: string;
  scheduleType: 'recurring' | 'one_time' | 'adhoc';
  dayOfWeek?: number;
  scheduledDate?: string;
  startTime: string;
  endTime: string;
  effectiveFrom: string;
  effectiveTo?: string;
  isActive: boolean;
  notes?: string;
  educatorName?: string;
  educatorEmail?: string;
}

interface ClassAssignment {
  assignmentId: number;
  classId: number;
  className: string;
  classLocation?: string;
  isPrimary: boolean;
  canStartSession: boolean;
  validFrom?: string;
  validTo?: string;
  schedules: EducatorSchedule[];
}

interface EducatorDetails {
  id: number;
  name: string;
  email: string;
  classes: ClassAssignment[];
  totalSchedules: number;
  recentSessions: any[];
}

interface Educator {
  id: number;
  name: string;
  email: string;
  classes: { assignmentId: number; classId: number; className: string; isPrimary: boolean }[];
  totalAssignments: number;
}

function formatTime(timeStr: string): string {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

function EducatorListView() {
  const [, navigate] = useLocation();

  const { data: educators, isLoading, error } = useQuery<Educator[]>({
    queryKey: ['/api/admin/educators'],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">Failed to load educators. Please try again.</p>
        </CardContent>
      </Card>
    );
  }

  if (!educators || educators.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No educators found.</p>
          <p className="text-sm text-muted-foreground mt-2">
            Assign educators to classes to see them here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Educators ({educators.length})
        </CardTitle>
        <CardDescription>
          View and manage educator schedules and class assignments
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Classes</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {educators.map((educator) => (
              <TableRow key={educator.id}>
                <TableCell className="font-medium">{educator.name}</TableCell>
                <TableCell>{educator.email}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {educator.classes.slice(0, 3).map((cls) => (
                      <Badge key={cls.assignmentId} variant="secondary">
                        {cls.className}
                      </Badge>
                    ))}
                    {educator.classes.length > 3 && (
                      <Badge variant="outline">+{educator.classes.length - 3} more</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/schools/educators/${educator.id}`)}
                    data-testid={`button-view-educator-${educator.id}`}
                  >
                    Manage
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function EducatorDetailView({ educatorId }: { educatorId: number }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddScheduleOpen, setIsAddScheduleOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<ClassAssignment | null>(null);

  const { data: educator, isLoading, error } = useQuery<EducatorDetails>({
    queryKey: ['/api/admin/educators', educatorId],
  });

  const createScheduleMutation = useMutation({
    mutationFn: (scheduleData: any) => 
      apiRequest('POST', '/api/admin/educators/schedules', scheduleData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/educators', educatorId] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/educators/schedules'] });
      setIsAddScheduleOpen(false);
      toast({
        title: "Success",
        description: "Schedule created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create schedule",
        variant: "destructive",
      });
    }
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: (scheduleId: number) => 
      apiRequest('DELETE', `/api/admin/educators/schedules/${scheduleId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/educators', educatorId] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/educators/schedules'] });
      toast({
        title: "Success",
        description: "Schedule deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete schedule",
        variant: "destructive",
      });
    }
  });

  const handleCreateSchedule = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    if (!selectedAssignment) {
      toast({
        title: "Error",
        description: "Please select a class assignment",
        variant: "destructive",
      });
      return;
    }

    const scheduleData = {
      assignmentId: selectedAssignment.assignmentId,
      educatorId: educatorId,
      classId: selectedAssignment.classId,
      scheduleType: formData.get('scheduleType') as string,
      dayOfWeek: formData.get('scheduleType') === 'recurring' 
        ? parseInt(formData.get('dayOfWeek') as string) 
        : undefined,
      scheduledDate: formData.get('scheduleType') === 'one_time' 
        ? formData.get('scheduledDate') as string 
        : undefined,
      startTime: formData.get('startTime') as string,
      endTime: formData.get('endTime') as string,
      effectiveFrom: formData.get('effectiveFrom') as string,
      effectiveTo: formData.get('effectiveTo') as string || undefined,
      notes: formData.get('notes') as string || undefined,
    };

    createScheduleMutation.mutate(scheduleData);
  };

  if (isLoading) {
    return (
      <SchoolAdminLayout pageTitle="Educator Profile">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </SchoolAdminLayout>
    );
  }

  if (error || !educator) {
    return (
      <SchoolAdminLayout pageTitle="Educator Not Found">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Educator not found.</p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => navigate('/schools/educators')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Educators
            </Button>
          </CardContent>
        </Card>
      </SchoolAdminLayout>
    );
  }

  return (
    <SchoolAdminLayout pageTitle={`${educator.name} - Educator Profile`}>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => navigate('/schools/educators')}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{educator.name}</h1>
            <p className="text-muted-foreground">{educator.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Classes</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{educator.classes.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Schedules</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{educator.totalSchedules}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Recent Sessions</CardTitle>
              <Timer className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{educator.recentSessions.length}</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="classes">
          <TabsList>
            <TabsTrigger value="classes">Classes & Schedules</TabsTrigger>
            <TabsTrigger value="sessions">Recent Sessions</TabsTrigger>
          </TabsList>
          
          <TabsContent value="classes" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Class Assignments</h3>
              <Dialog open={isAddScheduleOpen} onOpenChange={setIsAddScheduleOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-schedule">
                    <PlusCircle className="h-4 w-4 mr-2" />
                    Add Schedule
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Add Schedule</DialogTitle>
                    <DialogDescription>
                      Create a new schedule time block for this educator.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateSchedule} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="classAssignment">Class</Label>
                      <Select 
                        onValueChange={(value) => {
                          const assignment = educator.classes.find(c => c.assignmentId === parseInt(value));
                          setSelectedAssignment(assignment || null);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a class" />
                        </SelectTrigger>
                        <SelectContent>
                          {educator.classes.map((cls) => (
                            <SelectItem key={cls.assignmentId} value={cls.assignmentId.toString()}>
                              {cls.className}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="scheduleType">Schedule Type</Label>
                      <Select name="scheduleType" defaultValue="recurring">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="recurring">Recurring (Weekly)</SelectItem>
                          <SelectItem value="one_time">One-Time</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dayOfWeek">Day of Week</Label>
                      <Select name="dayOfWeek" defaultValue="0">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DAYS_OF_WEEK.map((day) => (
                            <SelectItem key={day.value} value={day.value}>
                              {day.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="startTime">Start Time</Label>
                        <Input type="time" name="startTime" required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="endTime">End Time</Label>
                        <Input type="time" name="endTime" required />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="effectiveFrom">Effective From</Label>
                      <Input type="date" name="effectiveFrom" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="effectiveTo">Effective To (Optional)</Label>
                      <Input type="date" name="effectiveTo" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="notes">Notes (Optional)</Label>
                      <Input name="notes" placeholder="Any additional notes..." />
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setIsAddScheduleOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createScheduleMutation.isPending}>
                        {createScheduleMutation.isPending ? 'Creating...' : 'Create Schedule'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {educator.classes.map((classAssignment) => (
              <Card key={classAssignment.assignmentId}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <BookOpen className="h-5 w-5" />
                        {classAssignment.className}
                        {classAssignment.isPrimary && (
                          <Badge variant="secondary">Primary</Badge>
                        )}
                      </CardTitle>
                      {classAssignment.classLocation && (
                        <CardDescription>{classAssignment.classLocation}</CardDescription>
                      )}
                    </div>
                    <Badge variant={classAssignment.canStartSession ? "default" : "outline"}>
                      {classAssignment.canStartSession ? 'Can Start Sessions' : 'View Only'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {classAssignment.schedules.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No schedules set for this class.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead>Day/Date</TableHead>
                          <TableHead>Time</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {classAssignment.schedules.map((schedule) => (
                          <TableRow key={schedule.id}>
                            <TableCell>
                              <Badge variant="outline">
                                {schedule.scheduleType === 'recurring' ? 'Weekly' : 'One-Time'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {schedule.scheduleType === 'recurring' && schedule.dayOfWeek !== undefined
                                ? DAYS_OF_WEEK[schedule.dayOfWeek]?.label
                                : schedule.scheduledDate}
                            </TableCell>
                            <TableCell>
                              {formatTime(schedule.startTime)} - {formatTime(schedule.endTime)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={schedule.isActive ? "default" : "secondary"}>
                                {schedule.isActive ? 'Active' : 'Inactive'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteScheduleMutation.mutate(schedule.id)}
                                disabled={deleteScheduleMutation.isPending}
                                data-testid={`button-delete-schedule-${schedule.id}`}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="sessions">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Recent Sessions
                </CardTitle>
                <CardDescription>
                  The educator's most recent class sessions
                </CardDescription>
              </CardHeader>
              <CardContent>
                {educator.recentSessions.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No sessions recorded yet.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Class</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {educator.recentSessions.map((session) => (
                        <TableRow key={session.id}>
                          <TableCell>{session.scheduledDate}</TableCell>
                          <TableCell>{session.classId}</TableCell>
                          <TableCell>
                            {session.scheduledStartTime} - {session.scheduledEndTime}
                          </TableCell>
                          <TableCell>
                            <Badge>{session.status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </SchoolAdminLayout>
  );
}

export default function EducatorManagementPage() {
  const [matchList, paramsFromList] = useRoute('/schools/educators');
  const [matchDetail, paramsFromDetail] = useRoute<{ educatorId: string }>('/schools/educators/:educatorId');

  if (matchDetail && paramsFromDetail?.educatorId) {
    return <EducatorDetailView educatorId={parseInt(paramsFromDetail.educatorId)} />;
  }

  return (
    <SchoolAdminLayout pageTitle="Educator Management">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Educator Management</h1>
            <p className="text-muted-foreground">
              View and manage educator schedules and class assignments
            </p>
          </div>
        </div>
        <EducatorListView />
      </div>
    </SchoolAdminLayout>
  );
}
