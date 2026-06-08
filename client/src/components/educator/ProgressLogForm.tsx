import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import StudentSearchSelect from '@/components/lexile/StudentSearchSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Info, Loader2, Plus } from 'lucide-react';
import QuarterlyReportWizard from '@/components/educator/QuarterlyReportWizard';

const formSchema = z.object({
  childId: z.number({ required_error: 'Select a student' }).int().positive(),
  sessionId: z.number().int().positive(),
  subjectId: z.number().int().positive(),
  progressTrackId: z.number().int().positive(),
  eventDate: z.string().min(1),
  lessonNumber: z.coerce.number().int().positive().optional().or(z.literal('')),
  unitLabel: z.string().max(120).optional(),
  topicsCovered: z.string().max(2000).optional(),
  topicsSummary: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
}).refine(
  (d) => !!(d.lessonNumber || (d.unitLabel && d.unitLabel.trim()) || (d.topicsCovered && d.topicsCovered.trim())),
  { message: 'Enter a lesson number, unit/chapter, or topics covered', path: ['topicsCovered'] },
);

type FormValues = z.infer<typeof formSchema>;

type Props = {
  fixedChildId?: number;
  fixedChildName?: string;
  onSuccess?: () => void;
  compact?: boolean;
};

export default function ProgressLogForm({ fixedChildId, fixedChildName, onSuccess, compact }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showNewTrack, setShowNewTrack] = useState(false);
  const [newTrackName, setNewTrackName] = useState('');
  const [newTrackLessons, setNewTrackLessons] = useState('');

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      eventDate: format(new Date(), 'yyyy-MM-dd'),
      childId: fixedChildId,
    } as FormValues,
  });

  const childId = form.watch('childId');
  const subjectId = form.watch('subjectId');
  const progressTrackId = form.watch('progressTrackId');

  const { data: subjects = [] } = useQuery<{ id: number; label: string; key: string }[]>({
    queryKey: ['/api/progress/subjects'],
  });

  const { data: tracks = [], refetch: refetchTracks } = useQuery<{ id: number; name: string; totalLessons: number | null }[]>({
    queryKey: ['/api/progress/tracks', subjectId],
    queryFn: async () => {
      if (!subjectId) return [];
      const res = await fetch(`/api/progress/tracks?subjectId=${subjectId}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!subjectId,
  });

  const { data: sessionData } = useQuery<{ sessionId: number | null }>({
    queryKey: ['/api/progress/students', childId, 'active-session'],
    queryFn: async () => {
      const res = await fetch(`/api/progress/students/${childId}/active-session`, { credentials: 'include' });
      return res.json();
    },
    enabled: !!childId,
  });

  const { data: currentProgress = [] } = useQuery({
    queryKey: ['/api/progress/students', childId, 'current'],
    queryFn: async () => {
      const res = await fetch(`/api/progress/students/${childId}/current`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!childId && !!progressTrackId,
  });

  const currentForTrack = (currentProgress as any[]).find(
    (c) => c.current?.progressTrackId === progressTrackId || c.track?.id === progressTrackId,
  );

  useEffect(() => {
    if (fixedChildId) form.setValue('childId', fixedChildId);
  }, [fixedChildId, form]);

  useEffect(() => {
    if (sessionData?.sessionId) form.setValue('sessionId', sessionData.sessionId);
  }, [sessionData, form]);

  const mutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const body = {
        sessionId: data.sessionId,
        progressTrackId: data.progressTrackId,
        eventDate: data.eventDate,
        lessonNumber: data.lessonNumber === '' ? null : data.lessonNumber ?? null,
        unitLabel: data.unitLabel || null,
        topicsCovered: data.topicsCovered || null,
        topicsSummary: data.topicsSummary || null,
        notes: data.notes || null,
      };
      const res = await apiRequest('POST', `/api/progress/students/${data.childId}/log`, body);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to save');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Saved', description: 'Progress recorded successfully.' });
      queryClient.invalidateQueries({ queryKey: ['/api/progress'] });
      onSuccess?.();
    },
    onError: (e: Error) => toast({ variant: 'destructive', title: 'Error', description: e.message }),
  });

  const createTrackMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/progress/tracks', {
        subjectId,
        name: newTrackName,
        totalLessons: newTrackLessons ? parseInt(newTrackLessons) : null,
        trackKind: 'book_series',
      });
      if (!res.ok) throw new Error('Failed to create track');
      return res.json();
    },
    onSuccess: (track: { id: number }) => {
      form.setValue('progressTrackId', track.id);
      setShowNewTrack(false);
      setNewTrackName('');
      refetchTracks();
      toast({ title: 'Track added', description: 'Curriculum track created.' });
    },
  });

  const onSubmit = (data: FormValues) => {
    if (!data.sessionId) {
      toast({
        variant: 'destructive',
        title: 'No active session',
        description: 'This student needs an active program enrollment before progress can be logged.',
      });
      return;
    }
    mutation.mutate(data);
  };

  const saveAndAnother = () => {
    form.handleSubmit((data) => {
      mutation.mutate(data, {
        onSuccess: () => {
          const keepSubject = data.subjectId;
          const keepTrack = data.progressTrackId;
          const keepSession = data.sessionId;
          form.reset({
            eventDate: format(new Date(), 'yyyy-MM-dd'),
            subjectId: keepSubject,
            progressTrackId: keepTrack,
            sessionId: keepSession,
          });
        },
      });
    })();
  };

  return (
    <Card className={compact ? 'border-0 shadow-none' : ''}>
      {!compact && (
        <CardHeader>
          <CardTitle>Log curriculum progress</CardTitle>
          <CardDescription>Record where students left off and what was covered (any subject).</CardDescription>
        </CardHeader>
      )}
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {!fixedChildId && (
              <FormField
                control={form.control}
                name="childId"
                render={() => (
                  <FormItem>
                    <FormLabel>Student *</FormLabel>
                    <StudentSearchSelect
                      value={childId ? String(childId) : undefined}
                      onSelect={(id) => form.setValue('childId', id as number)}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {fixedChildId && fixedChildName && (
              <p className="text-sm text-muted-foreground">Student: <strong>{fixedChildName}</strong></p>
            )}

            {childId && sessionData && !sessionData.sessionId && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2" data-testid="alert-no-session">
                No active program session found for this student. Enroll them in a session before logging progress.
              </p>
            )}

            <FormField
              control={form.control}
              name="subjectId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject *</FormLabel>
                  <Select
                    value={field.value ? String(field.value) : ''}
                    onValueChange={(v) => {
                      field.onChange(parseInt(v));
                      form.setValue('progressTrackId', 0 as any);
                    }}
                  >
                    <SelectTrigger data-testid="select-progress-subject">
                      <SelectValue placeholder="Select subject" />
                    </SelectTrigger>
                    <SelectContent>
                      {subjects.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <FormField
                control={form.control}
                name="progressTrackId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Curriculum / series *</FormLabel>
                    <Select
                      value={field.value ? String(field.value) : ''}
                      onValueChange={(v) => field.onChange(parseInt(v))}
                      disabled={!subjectId}
                    >
                      <SelectTrigger data-testid="select-progress-track">
                        <SelectValue placeholder="Select track" />
                      </SelectTrigger>
                      <SelectContent>
                        {tracks.map((t) => (
                          <SelectItem key={t.id} value={String(t.id)}>
                            {t.name}{t.totalLessons ? ` (${t.totalLessons} lessons)` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => setShowNewTrack(true)} disabled={!subjectId}>
                <Plus className="h-3 w-3 mr-1" /> Add new track
              </Button>
            </div>

            {currentForTrack && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm">
                <div className="flex items-center gap-1 text-blue-700 font-medium text-xs uppercase mb-1">
                  <Info className="h-3.5 w-3.5" /> Current position
                </div>
                <p>
                  {currentForTrack.current?.lessonNumber != null && `Lesson ${currentForTrack.current.lessonNumber}`}
                  {currentForTrack.current?.unitLabel && ` • ${currentForTrack.current.unitLabel}`}
                </p>
                {currentForTrack.current?.topicsSummary && (
                  <p className="text-blue-600 mt-1">{currentForTrack.current.topicsSummary}</p>
                )}
              </div>
            )}

            <FormField
              control={form.control}
              name="eventDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date covered *</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} max={format(new Date(), 'yyyy-MM-dd')} style={{ fontSize: '16px' }} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="lessonNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lesson number</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        placeholder="e.g., 42"
                        data-testid="input-progress-lesson"
                        style={{ fontSize: '16px' }}
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unitLabel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit / chapter</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Fractions" data-testid="input-progress-unit" style={{ fontSize: '16px' }} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="topicsCovered"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Topics covered</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="What we covered today"
                      data-testid="textarea-progress-topics"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="topicsSummary"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Where we left off (summary)</FormLabel>
                  <FormControl>
                    <Input placeholder="Short resume point for next class" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (staff only)</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-progress">
                {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save progress
              </Button>
              {!fixedChildId && (
                <Button type="button" variant="secondary" onClick={saveAndAnother} disabled={mutation.isPending} data-testid="button-save-progress-another">
                  Save & add another
                </Button>
              )}
            </div>
          </form>
        </Form>

        <Dialog open={showNewTrack} onOpenChange={setShowNewTrack}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add curriculum track</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <Label>Name *</Label>
                <Input value={newTrackName} onChange={(e) => setNewTrackName(e.target.value)} placeholder="Dimensions Math 1A" />
              </div>
              <div>
                <Label>Total lessons (optional)</Label>
                <Input type="number" value={newTrackLessons} onChange={(e) => setNewTrackLessons(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewTrack(false)}>Cancel</Button>
              <Button onClick={() => createTrackMutation.mutate()} disabled={!newTrackName.trim() || createTrackMutation.isPending}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {childId && (
          <div className="pt-6 border-t mt-6">
            <QuarterlyReportWizard
              childId={childId}
              childName={fixedChildName || 'Student'}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
