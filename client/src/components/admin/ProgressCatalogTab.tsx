import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, TrendingUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type Subject = { id: number; key: string; label: string; isActive: boolean };
type Track = { id: number; name: string; totalLessons: number | null; trackKind: string; isActive: boolean };

export default function ProgressCatalogTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [showSubject, setShowSubject] = useState(false);
  const [showTrack, setShowTrack] = useState(false);
  const [subjectLabel, setSubjectLabel] = useState('');
  const [subjectKey, setSubjectKey] = useState('');
  const [trackName, setTrackName] = useState('');
  const [trackLessons, setTrackLessons] = useState('');

  const { data: subjects = [], isLoading } = useQuery<Subject[]>({
    queryKey: ['/api/progress/subjects'],
  });

  const { data: tracks = [], isLoading: tracksLoading } = useQuery<Track[]>({
    queryKey: ['/api/progress/tracks', subjectId],
    queryFn: async () => {
      const res = await fetch(`/api/progress/tracks?subjectId=${subjectId}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!subjectId,
  });

  const createSubject = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/progress/subjects', {
        key: subjectKey.trim().toLowerCase().replace(/\s+/g, '_'),
        label: subjectLabel.trim(),
        isActive: true,
        sortOrder: subjects.length,
      });
      if (!res.ok) throw new Error((await res.json()).message || 'Failed');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/progress/subjects'] });
      setShowSubject(false);
      setSubjectLabel('');
      setSubjectKey('');
      toast({ title: 'Subject created' });
    },
    onError: (e: Error) => toast({ variant: 'destructive', title: 'Error', description: e.message }),
  });

  const createTrack = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/progress/tracks', {
        subjectId,
        name: trackName.trim(),
        totalLessons: trackLessons ? parseInt(trackLessons) : null,
        trackKind: 'book_series',
        isActive: true,
      });
      if (!res.ok) throw new Error((await res.json()).message || 'Failed');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/progress/tracks', subjectId] });
      setShowTrack(false);
      setTrackName('');
      setTrackLessons('');
      toast({ title: 'Track created' });
    },
    onError: (e: Error) => toast({ variant: 'destructive', title: 'Error', description: e.message }),
  });

  return (
    <div className="space-y-4" data-testid="tab-progress-catalog">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Progress catalog
            </CardTitle>
            <CardDescription>Subjects and curriculum tracks used for multi-subject progress logging.</CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowSubject(true)} data-testid="button-add-progress-subject">
            <Plus className="h-4 w-4 mr-1" /> Add subject
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subjects.map((s) => (
                  <TableRow
                    key={s.id}
                    className={subjectId === s.id ? 'bg-muted/50' : 'cursor-pointer'}
                    onClick={() => setSubjectId(s.id)}
                    data-testid={`row-subject-${s.key}`}
                  >
                    <TableCell>{s.key}</TableCell>
                    <TableCell>{s.label}</TableCell>
                    <TableCell>{s.isActive ? 'Yes' : 'No'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {subjectId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Tracks</CardTitle>
            <Button size="sm" onClick={() => setShowTrack(true)} data-testid="button-add-progress-track">
              <Plus className="h-4 w-4 mr-1" /> Add track
            </Button>
          </CardHeader>
          <CardContent>
            {tracksLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : tracks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tracks for this subject yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Lessons</TableHead>
                    <TableHead>Kind</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tracks.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{t.name}</TableCell>
                      <TableCell>{t.totalLessons ?? '—'}</TableCell>
                      <TableCell>{t.trackKind}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={showSubject} onOpenChange={setShowSubject}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New subject</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Label</Label>
              <Input value={subjectLabel} onChange={(e) => setSubjectLabel(e.target.value)} placeholder="Mathematics" />
            </div>
            <div>
              <Label>Key</Label>
              <Input value={subjectKey} onChange={(e) => setSubjectKey(e.target.value)} placeholder="math" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => createSubject.mutate()} disabled={!subjectLabel || createSubject.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showTrack} onOpenChange={setShowTrack}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New track</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={trackName} onChange={(e) => setTrackName(e.target.value)} placeholder="Saxon Math 5/4" />
            </div>
            <div>
              <Label>Total lessons (optional)</Label>
              <Input type="number" value={trackLessons} onChange={(e) => setTrackLessons(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => createTrack.mutate()} disabled={!trackName || createTrack.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
