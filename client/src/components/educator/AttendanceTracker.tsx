import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Users, Check, X, Clock, AlertCircle, UserCheck, Loader2, Save, MessageSquare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { EducatorLoadingState, EducatorErrorState } from './EducatorErrorBoundary';

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

interface RosterStudent {
  childId: number;
  firstName: string;
  lastName: string;
  gradeLevel?: string;
  attendanceId?: number;
  status?: AttendanceStatus;
  checkInTime?: string;
  checkOutTime?: string;
  notes?: string;
}

interface AttendanceTrackerProps {
  sessionId: number;
  isSessionActive: boolean;
  schoolId: number;
}

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; icon: typeof Check; color: string; bgColor: string }> = {
  present: { label: 'Present', icon: Check, color: 'text-green-600', bgColor: 'bg-green-100' },
  absent: { label: 'Absent', icon: X, color: 'text-red-600', bgColor: 'bg-red-100' },
  late: { label: 'Late', icon: Clock, color: 'text-yellow-600', bgColor: 'bg-yellow-100' },
  excused: { label: 'Excused', icon: AlertCircle, color: 'text-blue-600', bgColor: 'bg-blue-100' },
};

export function AttendanceTracker({ sessionId, isSessionActive, schoolId }: AttendanceTrackerProps) {
  const { toast } = useToast();
  const [selectedStudents, setSelectedStudents] = useState<Set<number>>(new Set());
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [currentStudent, setCurrentStudent] = useState<RosterStudent | null>(null);
  const [noteText, setNoteText] = useState('');
  const [pendingChanges, setPendingChanges] = useState<Map<number, { status: AttendanceStatus; notes?: string }>>(new Map());

  const { data: roster, isLoading, error, refetch } = useQuery<RosterStudent[]>({
    queryKey: ['/api/educator/sessions', sessionId, 'roster'],
  });

  const bulkAttendanceMutation = useMutation({
    mutationFn: async (records: { childId: number; status: AttendanceStatus; notes?: string }[]) => {
      return apiRequest('POST', '/api/educator/attendance/bulk', {
        sessionId,
        attendance: records,
      });
    },
    onSuccess: () => {
      toast({
        title: 'Attendance saved',
        description: 'Attendance records have been updated.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/educator/sessions', sessionId, 'roster'] });
      setPendingChanges(new Map());
      setSelectedStudents(new Set());
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to save attendance',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleStatusChange = (childId: number, status: AttendanceStatus) => {
    setPendingChanges(prev => {
      const updated = new Map(prev);
      const existing = updated.get(childId) || {};
      updated.set(childId, { ...existing, status });
      return updated;
    });
  };

  const handleNoteAdd = (student: RosterStudent) => {
    setCurrentStudent(student);
    const pending = pendingChanges.get(student.childId);
    setNoteText(pending?.notes || student.notes || '');
    setNoteDialogOpen(true);
  };

  const saveNote = () => {
    if (currentStudent) {
      setPendingChanges(prev => {
        const updated = new Map(prev);
        const existing = updated.get(currentStudent.childId) || { status: currentStudent.status || 'present' };
        updated.set(currentStudent.childId, { ...existing, notes: noteText });
        return updated;
      });
    }
    setNoteDialogOpen(false);
    setCurrentStudent(null);
    setNoteText('');
  };

  const toggleSelectAll = () => {
    if (!roster) return;
    if (selectedStudents.size === roster.length) {
      setSelectedStudents(new Set());
    } else {
      setSelectedStudents(new Set(roster.map(s => s.childId)));
    }
  };

  const markSelectedAs = (status: AttendanceStatus) => {
    selectedStudents.forEach(childId => {
      handleStatusChange(childId, status);
    });
  };

  const saveAllChanges = () => {
    if (pendingChanges.size === 0) {
      toast({
        title: 'No changes',
        description: 'No attendance changes to save.',
      });
      return;
    }

    const records = Array.from(pendingChanges.entries()).map(([childId, data]) => ({
      childId,
      status: data.status,
      notes: data.notes,
    }));

    bulkAttendanceMutation.mutate(records);
  };

  const getEffectiveStatus = (student: RosterStudent): AttendanceStatus | undefined => {
    return pendingChanges.get(student.childId)?.status || student.status;
  };

  const getEffectiveNotes = (student: RosterStudent): string | undefined => {
    return pendingChanges.get(student.childId)?.notes ?? student.notes;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <EducatorLoadingState message="Loading class roster..." />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <EducatorErrorState 
            message="Couldn't load class roster. Please try again."
            onRetry={() => refetch()}
          />
        </CardContent>
      </Card>
    );
  }

  if (!roster || roster.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Attendance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No students enrolled in this class</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const presentCount = roster.filter(s => getEffectiveStatus(s) === 'present').length;
  const absentCount = roster.filter(s => getEffectiveStatus(s) === 'absent').length;
  const lateCount = roster.filter(s => getEffectiveStatus(s) === 'late').length;
  const unmarkedCount = roster.filter(s => !getEffectiveStatus(s)).length;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Attendance
              </CardTitle>
              <CardDescription>
                {roster.length} student{roster.length !== 1 ? 's' : ''} enrolled
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {presentCount > 0 && (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  {presentCount} present
                </Badge>
              )}
              {absentCount > 0 && (
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                  {absentCount} absent
                </Badge>
              )}
              {lateCount > 0 && (
                <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                  {lateCount} late
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isSessionActive && (
            <div className="flex flex-wrap items-center gap-2 mb-4 pb-4 border-b">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="select-all"
                  checked={selectedStudents.size === roster.length}
                  onCheckedChange={toggleSelectAll}
                  data-testid="checkbox-select-all"
                />
                <Label htmlFor="select-all" className="text-sm cursor-pointer">
                  Select All
                </Label>
              </div>
              
              {selectedStudents.size > 0 && (
                <>
                  <span className="text-muted-foreground text-sm">|</span>
                  <span className="text-sm text-muted-foreground">
                    {selectedStudents.size} selected
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-green-600 border-green-300 hover:bg-green-50"
                    onClick={() => markSelectedAs('present')}
                    data-testid="button-mark-present"
                  >
                    <Check className="h-3 w-3" />
                    Present
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-red-600 border-red-300 hover:bg-red-50"
                    onClick={() => markSelectedAs('absent')}
                    data-testid="button-mark-absent"
                  >
                    <X className="h-3 w-3" />
                    Absent
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-yellow-600 border-yellow-300 hover:bg-yellow-50"
                    onClick={() => markSelectedAs('late')}
                    data-testid="button-mark-late"
                  >
                    <Clock className="h-3 w-3" />
                    Late
                  </Button>
                </>
              )}

              {pendingChanges.size > 0 && (
                <Button
                  size="sm"
                  className="ml-auto gap-2"
                  onClick={saveAllChanges}
                  disabled={bulkAttendanceMutation.isPending}
                  data-testid="button-save-attendance"
                >
                  {bulkAttendanceMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save Changes ({pendingChanges.size})
                </Button>
              )}
            </div>
          )}

          <div className="space-y-2">
            {roster.map((student) => {
              const effectiveStatus = getEffectiveStatus(student);
              const effectiveNotes = getEffectiveNotes(student);
              const statusConfig = effectiveStatus ? STATUS_CONFIG[effectiveStatus] : null;
              const hasPendingChange = pendingChanges.has(student.childId);
              const isSelected = selectedStudents.has(student.childId);

              return (
                <div
                  key={student.childId}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    hasPendingChange ? 'border-blue-300 bg-blue-50/50' : 'border-gray-200'
                  } ${isSelected ? 'bg-gray-50' : ''}`}
                  data-testid={`attendance-row-${student.childId}`}
                >
                  {isSessionActive && (
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) => {
                        setSelectedStudents(prev => {
                          const updated = new Set(prev);
                          if (checked) {
                            updated.add(student.childId);
                          } else {
                            updated.delete(student.childId);
                          }
                          return updated;
                        });
                      }}
                      data-testid={`checkbox-student-${student.childId}`}
                    />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="font-medium">
                      {student.firstName} {student.lastName}
                    </div>
                    {student.gradeLevel && (
                      <div className="text-sm text-muted-foreground">
                        {student.gradeLevel}
                      </div>
                    )}
                  </div>

                  {effectiveNotes && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="text-muted-foreground">
                          <MessageSquare className="h-4 w-4" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">{effectiveNotes}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}

                  {isSessionActive ? (
                    <div className="flex items-center gap-2">
                      <Select
                        value={effectiveStatus || ''}
                        onValueChange={(value) => handleStatusChange(student.childId, value as AttendanceStatus)}
                      >
                        <SelectTrigger 
                          className={`w-32 ${statusConfig ? statusConfig.bgColor : ''}`}
                          data-testid={`select-status-${student.childId}`}
                        >
                          <SelectValue placeholder="Mark..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="present">
                            <span className="flex items-center gap-2">
                              <Check className="h-4 w-4 text-green-600" />
                              Present
                            </span>
                          </SelectItem>
                          <SelectItem value="absent">
                            <span className="flex items-center gap-2">
                              <X className="h-4 w-4 text-red-600" />
                              Absent
                            </span>
                          </SelectItem>
                          <SelectItem value="late">
                            <span className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-yellow-600" />
                              Late
                            </span>
                          </SelectItem>
                          <SelectItem value="excused">
                            <span className="flex items-center gap-2">
                              <AlertCircle className="h-4 w-4 text-blue-600" />
                              Excused
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>

                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleNoteAdd(student)}
                        data-testid={`button-note-${student.childId}`}
                      >
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      {statusConfig ? (
                        <Badge 
                          variant="outline" 
                          className={`${statusConfig.bgColor} ${statusConfig.color} border-0`}
                        >
                          <statusConfig.icon className="h-3 w-3 mr-1" />
                          {statusConfig.label}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Not marked
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {unmarkedCount > 0 && isSessionActive && (
            <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200 flex items-center gap-2 text-sm text-yellow-700">
              <AlertCircle className="h-4 w-4" />
              <span>{unmarkedCount} student{unmarkedCount !== 1 ? 's' : ''} not yet marked</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
            <DialogDescription>
              Add a note for {currentStudent?.firstName} {currentStudent?.lastName}'s attendance record.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="attendance-note">Note</Label>
            <Textarea
              id="attendance-note"
              placeholder="e.g., Left early due to appointment, arrived 15 minutes late..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              className="mt-2"
              data-testid="input-attendance-note"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveNote} data-testid="button-save-note">
              Save Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
