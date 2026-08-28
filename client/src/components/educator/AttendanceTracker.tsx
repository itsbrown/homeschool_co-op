import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Users, Check, X, Clock, AlertCircle, Loader2, MessageSquare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
import { invalidateEducatorSessionQueries } from '@/lib/educator-queries';
import { EducatorLoadingState, EducatorErrorState } from './EducatorErrorBoundary';
import { StudentSafetyBadges, StudentSafetySheet, type StudentSafetyProfile } from './StudentSafetySheet';
import { DayTypeBadge } from '@/components/roster/DayTypeBadge';
import { RosterBirthday } from '@/components/roster/RosterBirthday';
import { countRosterDayTypes, formatRosterDayTypeSummary } from '@shared/roster-day-type';

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

interface RosterStudent {
  childId: number;
  firstName: string;
  lastName: string;
  gradeLevel?: string;
  birthdate?: string | null;
  dayType?: string | null;
  attendanceId?: number;
  status?: AttendanceStatus;
  checkInTime?: string;
  checkOutTime?: string;
  notes?: string;
  allergies: string | null;
  medicalInfo: string | null;
  specialNeeds: string | null;
  hasAllergyAlert: boolean;
  hasMedicalAlert: boolean;
  hasSpecialNeedsAlert: boolean;
  parentPhone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
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

export function AttendanceTracker({ sessionId, isSessionActive }: AttendanceTrackerProps) {
  const { toast } = useToast();
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [currentStudent, setCurrentStudent] = useState<RosterStudent | null>(null);
  const [noteText, setNoteText] = useState('');
  const [safetyStudent, setSafetyStudent] = useState<StudentSafetyProfile | null>(null);
  const [pendingChanges, setPendingChanges] = useState<Map<number, { status: AttendanceStatus; notes?: string }>>(new Map());

  const { data: roster, isLoading, error, refetch } = useQuery<RosterStudent[]>({
    queryKey: ['/api/educator/sessions', sessionId, 'roster'],
    select: (data: any[]) => data.map((item) => ({
      childId: item.childId,
      firstName: item.childFirstName || item.firstName || '',
      lastName: item.childLastName || item.lastName || '',
      gradeLevel: item.gradeLevel,
      birthdate: item.birthdate ?? null,
      dayType: item.dayType ?? null,
      attendanceId: item.attendance?.id,
      status: item.attendance?.status,
      checkInTime: item.attendance?.checkInTime,
      checkOutTime: item.attendance?.checkOutTime,
      notes: item.attendance?.notes,
      allergies: item.allergies ?? null,
      medicalInfo: item.medicalInfo ?? null,
      specialNeeds: item.specialNeeds ?? null,
      hasAllergyAlert: Boolean(item.hasAllergyAlert),
      hasMedicalAlert: Boolean(item.hasMedicalAlert),
      hasSpecialNeedsAlert: Boolean(item.hasSpecialNeedsAlert),
      parentPhone: item.parentPhone ?? null,
      emergencyContactName: item.emergencyContactName ?? null,
      emergencyContactPhone: item.emergencyContactPhone ?? null,
      emergencyContactRelationship: item.emergencyContactRelationship ?? null,
    })),
  });

  const bulkAttendanceMutation = useMutation({
    mutationFn: async (records: { childId: number; status: AttendanceStatus; notes?: string }[]) => {
      return apiRequest('POST', '/api/educator/attendance/bulk', {
        sessionId,
        attendance: records,
      });
    },
    onSuccess: (_data, records) => {
      queryClient.invalidateQueries({ queryKey: ['/api/educator/sessions', sessionId, 'roster'] });
      invalidateEducatorSessionQueries();
      setPendingChanges((prev) => {
        const next = new Map(prev);
        for (const record of records) next.delete(record.childId);
        return next;
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Attendance did not save',
        description: error.message || 'Check the connection and tap again.',
        variant: 'destructive',
      });
    },
  });

  const persistRecords = (records: { childId: number; status: AttendanceStatus; notes?: string }[]) => {
    if (records.length === 0) return;
    setPendingChanges((prev) => {
      const next = new Map(prev);
      for (const record of records) {
        next.set(record.childId, { status: record.status, notes: record.notes });
      }
      return next;
    });
    bulkAttendanceMutation.mutate(records);
  };

  const handleStatusChange = (childId: number, status: AttendanceStatus) => {
    const student = roster?.find((s) => s.childId === childId);
    const notes = pendingChanges.get(childId)?.notes ?? student?.notes;
    persistRecords([{ childId, status, notes }]);
  };

  const handleNoteAdd = (student: RosterStudent) => {
    setCurrentStudent(student);
    const pending = pendingChanges.get(student.childId);
    setNoteText(pending?.notes || student.notes || '');
    setNoteDialogOpen(true);
  };

  const saveNote = () => {
    if (currentStudent) {
      const status =
        pendingChanges.get(currentStudent.childId)?.status ||
        currentStudent.status ||
        'present';
      persistRecords([{ childId: currentStudent.childId, status, notes: noteText }]);
    }
    setNoteDialogOpen(false);
    setCurrentStudent(null);
    setNoteText('');
  };

  const markAllAs = (status: AttendanceStatus) => {
    if (!roster) return;
    persistRecords(
      roster.map((student) => ({
        childId: student.childId,
        status,
        notes: pendingChanges.get(student.childId)?.notes ?? student.notes,
      })),
    );
  };

  const markUnmarkedAs = (status: AttendanceStatus) => {
    if (!roster) return;
    const unmarked = roster.filter((s) => !(pendingChanges.get(s.childId)?.status || s.status));
    persistRecords(
      unmarked.map((student) => ({
        childId: student.childId,
        status,
        notes: student.notes,
      })),
    );
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
  const dayTypeCounts = countRosterDayTypes(roster.map((s) => s.dayType));
  const dayTypeSummary = formatRosterDayTypeSummary(dayTypeCounts);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Attendance
              </CardTitle>
              <CardDescription>
                {roster.length} student{roster.length !== 1 ? 's' : ''} enrolled
                {dayTypeSummary ? (
                  <span data-testid="text-roster-day-type-summary"> · {dayTypeSummary}</span>
                ) : null}
                {bulkAttendanceMutation.isPending && (
                  <span className="ml-2 inline-flex items-center gap-1 text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Saving
                  </span>
                )}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
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
              {unmarkedCount > 0 && (
                <Badge
                  variant="outline"
                  className="bg-amber-50 text-amber-800 border-amber-200"
                  data-testid="badge-unmarked-count"
                >
                  {unmarkedCount} unmarked
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isSessionActive && (
            <div className="flex flex-wrap items-center gap-2 mb-4 pb-4 border-b">
              <Button
                size="lg"
                className="h-12 min-h-12 gap-1 bg-green-600 hover:bg-green-700"
                onClick={() => markAllAs('present')}
                disabled={bulkAttendanceMutation.isPending}
                data-testid="button-mark-all-present"
              >
                <Check className="h-4 w-4" />
                All present
              </Button>
              {unmarkedCount > 0 && (
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 min-h-12 gap-1 text-red-700 border-red-300"
                  onClick={() => markUnmarkedAs('absent')}
                  disabled={bulkAttendanceMutation.isPending}
                  data-testid="button-mark-rest-absent"
                >
                  <X className="h-4 w-4" />
                  Mark rest absent
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

              return (
                <div
                  key={student.childId}
                  className={`flex flex-col gap-3 p-3 rounded-lg border transition-colors ${
                    !effectiveStatus
                      ? 'border-amber-300 bg-amber-50/70'
                      : hasPendingChange
                        ? 'border-blue-300 bg-blue-50/50'
                        : 'border-gray-200'
                  }`}
                  data-testid={`attendance-row-${student.childId}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">
                        {student.firstName} {student.lastName}
                      </div>
                      {student.gradeLevel && (
                        <div className="text-xs text-muted-foreground">
                          {student.gradeLevel}
                        </div>
                      )}
                      {(student.dayType === 'half_day' || student.dayType === 'full_day') && (
                        <div className="mt-1">
                          <DayTypeBadge
                            dayType={student.dayType}
                            testId={`badge-day-type-${student.childId}`}
                          />
                        </div>
                      )}
                      <RosterBirthday
                        birthdate={student.birthdate}
                        compact
                        testId={`text-birthday-${student.childId}`}
                      />
                      {student.checkInTime && (
                        <div className="text-xs text-muted-foreground">
                          Marked {new Date(student.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                      <div className="mt-2">
                        <StudentSafetyBadges
                          student={student}
                          onOpen={() => setSafetyStudent(student)}
                        />
                      </div>
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

                    {!isSessionActive && (
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

                    {isSessionActive && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-11 w-11 min-h-11"
                        onClick={() => handleNoteAdd(student)}
                        data-testid={`button-note-${student.childId}`}
                      >
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  {isSessionActive && (
                    <div className="grid grid-cols-3 gap-2">
                      {(['present', 'late', 'absent'] as const).map((status) => {
                        const config = STATUS_CONFIG[status];
                        const selected = effectiveStatus === status;
                        return (
                          <Button
                            key={status}
                            type="button"
                            variant={selected ? 'default' : 'outline'}
                            className={`h-12 min-h-12 text-base ${selected ? config.bgColor + ' ' + config.color + ' border-transparent' : ''}`}
                            style={{ fontSize: '16px' }}
                            onClick={() => handleStatusChange(student.childId, status)}
                            data-testid={
                              status === 'present'
                                ? `select-status-${student.childId}`
                                : `button-status-${student.childId}-${status}`
                            }
                          >
                            <config.icon className="h-4 w-4 mr-1" />
                            {config.label}
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {unmarkedCount > 0 && isSessionActive && (
            <div
              className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200 flex items-center gap-2 text-sm text-yellow-800"
              data-testid="banner-unmarked-kids"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
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
              style={{ fontSize: '16px' }}
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
      <StudentSafetySheet
        student={safetyStudent}
        open={safetyStudent !== null}
        onOpenChange={(open) => {
          if (!open) setSafetyStudent(null);
        }}
      />
    </>
  );
}
