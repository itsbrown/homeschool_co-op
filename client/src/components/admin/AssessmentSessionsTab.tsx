import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Calendar, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { useState } from 'react';

type AssessmentSession = {
  id: number;
  childId: number;
  assessmentTypeId: number;
  startedAt: string;
  completedAt: string | null;
  status: string;
  totalQuestions: number | null;
  correctAnswers: number | null;
};

type LexileStudent = {
  id: number;
  firstName: string;
  lastName: string;
};

type ReportSnapshot = {
  id: number;
  childId: number;
  schoolYear: string;
  quarter: string;
  band: string;
  templateVersion: string;
  generatedAt: string;
};

export default function AssessmentSessionsTab() {
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery<AssessmentSession[]>({
    queryKey: ['/api/assessments/sessions', statusFilter],
    queryFn: async () => {
      const qs = statusFilter !== 'all' ? `?status=${encodeURIComponent(statusFilter)}` : '';
      const res = await fetch(`/api/assessments/sessions${qs}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load sessions');
      return res.json();
    },
  });

  const { data: students = [] } = useQuery<LexileStudent[]>({
    queryKey: ['/api/lexile/students'],
  });

  const { data: snapshots = [], isLoading: snapshotsLoading } = useQuery<ReportSnapshot[]>({
    queryKey: ['/api/progress/report/school-snapshots'],
    queryFn: async () => {
      const res = await fetch('/api/progress/report/school-snapshots', { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const studentName = (childId: number) => {
    const s = students.find((st) => st.id === childId);
    return s ? `${s.firstName} ${s.lastName}` : `Student #${childId}`;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            In-app assessment sessions
          </CardTitle>
          <CardDescription>
            School-scoped assessment runs tied to curriculum types. Filter by status to audit incomplete sessions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Status</span>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-session-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="in_progress">In progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="abandoned">Abandoned</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {sessionsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assessment sessions recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow key={session.id} data-testid={`session-row-${session.id}`}>
                    <TableCell>{studentName(session.childId)}</TableCell>
                    <TableCell>{format(new Date(session.startedAt), 'MMM d, yyyy h:mm a')}</TableCell>
                    <TableCell>
                      <Badge variant={session.status === 'completed' ? 'default' : 'secondary'}>
                        {session.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {session.correctAnswers != null && session.totalQuestions != null
                        ? `${session.correctAnswers}/${session.totalQuestions}`
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            NY | Progress reports generated
          </CardTitle>
          <CardDescription>
            Finalized quarterly snapshots for your school ({snapshots.length} total).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {snapshotsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : snapshots.length === 0 ? (
            <p className="text-sm text-muted-foreground">No finalized quarterly reports yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Quarter</TableHead>
                  <TableHead>Band</TableHead>
                  <TableHead>Generated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshots.slice(0, 25).map((snap) => (
                  <TableRow key={snap.id}>
                    <TableCell>{studentName(snap.childId)}</TableCell>
                    <TableCell>
                      {snap.quarter} {snap.schoolYear}
                    </TableCell>
                    <TableCell>{snap.band}</TableCell>
                    <TableCell>{format(new Date(snap.generatedAt), 'MMM d, yyyy')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
