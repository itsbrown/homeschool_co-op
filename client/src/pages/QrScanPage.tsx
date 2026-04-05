import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, CheckCircle, XCircle, Clock, LogIn, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/SupabaseProvider";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AttendanceTracker } from "@/components/educator/AttendanceTracker";

type SessionInfo = {
  sessionId: number;
  className: string;
  scheduledDate: string;
  startTime: string | null;
  endTime: string | null;
  status: string;
  educatorName: string | null;
  expiresAt: string | null;
};

type FullSession = {
  id: number;
  classId: number;
  schoolId: number;
  educatorId: number;
  status: string;
  scheduledDate: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  actualStartTime?: string;
};

function formatTime(t: string | null) {
  if (!t) return '—';
  const [h, m] = t.split(':');
  const hour = parseInt(h);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

function useElapsedTime(startTime: string | null | undefined, active: boolean) {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    if (!active || !startTime) {
      setElapsed('');
      return;
    }

    const update = () => {
      const start = new Date(startTime).getTime();
      const now = Date.now();
      const diffMs = now - start;
      if (diffMs < 0) { setElapsed('0:00'); return; }
      const totalSecs = Math.floor(diffMs / 1000);
      const hrs = Math.floor(totalSecs / 3600);
      const mins = Math.floor((totalSecs % 3600) / 60);
      const secs = totalSecs % 60;
      if (hrs > 0) {
        setElapsed(`${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
      } else {
        setElapsed(`${mins}:${String(secs).padStart(2, '0')}`);
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [active, startTime]);

  return elapsed;
}

export default function QrScanPage() {
  const { token } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [clockedIn, setClockedIn] = useState(false);
  const [clockInTime, setClockInTime] = useState<string | null>(null);

  const { data: sessionInfo, isLoading: sessionLoading, error: sessionError } = useQuery<SessionInfo>({
    queryKey: [`/api/public/session-by-qr/${token}`],
    enabled: !!token,
    retry: false,
  });

  const { data: fullSession } = useQuery<FullSession>({
    queryKey: ['/api/educator/sessions', sessionInfo?.sessionId],
    enabled: isAuthenticated && !!sessionInfo?.sessionId,
    retry: false,
  });

  const sessionActive = sessionInfo?.status === 'in_progress' || clockedIn;
  const sessionCompleted = sessionInfo?.status === 'completed';

  const actualStartTime = clockInTime || fullSession?.actualStartTime || null;
  const elapsed = useElapsedTime(actualStartTime, !!sessionActive);

  const clockInMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        'POST',
        `/api/educator/sessions/${sessionInfo!.sessionId}/teacher-checkin`,
        { qrToken: token }
      );
      return res.json();
    },
    onSuccess: (data) => {
      setClockedIn(true);
      setClockInTime(data.actualStartTime || new Date().toISOString());
      toast({ title: 'Clocked in', description: 'Session is now in progress.' });
      queryClient.invalidateQueries({ queryKey: ['/api/educator/sessions', sessionInfo?.sessionId] });
      queryClient.invalidateQueries({ queryKey: ['/api/educator/sessions', sessionInfo?.sessionId, 'roster'] });
    },
    onError: (err: any) => {
      toast({ title: 'Clock-in failed', description: err.message || 'Unable to clock in', variant: 'destructive' });
    },
  });

  if (authLoading || sessionLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">Loading session…</p>
      </div>
    );
  }

  if (sessionError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-gray-50">
        <div className="bg-white rounded-xl border p-8 text-center max-w-sm w-full shadow-sm">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold mb-1">Invalid QR Code</h2>
          <p className="text-sm text-muted-foreground">
            {(sessionError as Error).message?.includes('404') || (sessionError as Error).message?.includes('Invalid')
              ? 'This QR code is invalid or has expired.'
              : 'Unable to load session information.'}
          </p>
          <p className="text-xs text-muted-foreground mt-3">
            Ask your school administrator to generate a new QR code.
          </p>
        </div>
      </div>
    );
  }

  if (!sessionInfo) return null;

  const canClockIn = !sessionActive && !sessionCompleted && sessionInfo.status === 'scheduled';

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-gray-50">
        <div className="bg-white rounded-xl border p-8 text-center max-w-sm w-full shadow-sm">
          <QrCode className="h-12 w-12 text-primary mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-1">{sessionInfo.className}</h2>
          <p className="text-sm text-muted-foreground mb-1">{formatDate(sessionInfo.scheduledDate)}</p>
          <p className="text-sm text-muted-foreground mb-1">
            {formatTime(sessionInfo.startTime)} – {formatTime(sessionInfo.endTime)}
          </p>
          {sessionInfo.educatorName && (
            <p className="text-sm text-muted-foreground mb-6">Educator: {sessionInfo.educatorName}</p>
          )}
          <p className="text-sm mb-6">
            Sign in with your educator account to clock in and take attendance.
          </p>
          <Button
            className="w-full"
            onClick={() =>
              setLocation(`/login?returnTo=${encodeURIComponent(window.location.pathname)}`)
            }
          >
            <LogIn className="h-4 w-4 mr-2" />
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-xl">{sessionInfo.className}</CardTitle>
                <p className="text-sm text-muted-foreground mt-0.5">{formatDate(sessionInfo.scheduledDate)}</p>
                <p className="text-sm text-muted-foreground">
                  {formatTime(sessionInfo.startTime)} – {formatTime(sessionInfo.endTime)}
                </p>
                {sessionInfo.educatorName && (
                  <p className="text-sm text-muted-foreground mt-0.5">Educator: {sessionInfo.educatorName}</p>
                )}
              </div>
              <Badge
                className={
                  sessionActive
                    ? 'bg-blue-100 text-blue-700'
                    : sessionCompleted
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-700'
                }
              >
                {sessionActive ? 'In Progress' : sessionCompleted ? 'Completed' : 'Scheduled'}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="pt-0">
            {canClockIn && (
              <Button
                className="w-full"
                size="lg"
                onClick={() => clockInMutation.mutate()}
                disabled={clockInMutation.isPending}
              >
                {clockInMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Clock className="h-4 w-4 mr-2" />
                )}
                Clock In &amp; Start Session
              </Button>
            )}

            {sessionActive && (
              <div className="flex items-center justify-between gap-2 bg-green-50 rounded-md px-3 py-2">
                <div className="flex items-center gap-2 text-sm text-green-700">
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  <span>Session in progress</span>
                </div>
                {elapsed && (
                  <div className="flex items-center gap-1 text-sm font-mono font-semibold text-green-700">
                    <Clock className="h-3.5 w-3.5" />
                    {elapsed}
                  </div>
                )}
              </div>
            )}

            {sessionCompleted && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-gray-50 rounded-md px-3 py-2">
                <CheckCircle className="h-4 w-4 shrink-0" />
                <span>Session completed — you can still update attendance below</span>
              </div>
            )}
          </CardContent>
        </Card>

        {(sessionActive || sessionCompleted) && fullSession && (
          <AttendanceTracker
            sessionId={sessionInfo.sessionId}
            isSessionActive={true}
            schoolId={fullSession.schoolId}
          />
        )}
      </div>
    </div>
  );
}
