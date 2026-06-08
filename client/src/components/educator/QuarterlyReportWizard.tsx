import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { downloadProgressReportPdf } from '@/lib/downloadProgressReport';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Loader2, FileDown, CheckCircle2, Mail } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

type Props = {
  childId: number;
  childName: string;
  gradeLevel?: string;
};

const TERMS = ['fall', 'winter', 'spring'] as const;

function currentSchoolYear(): string {
  const y = new Date().getFullYear();
  const m = new Date().getMonth();
  const start = m >= 7 ? y : y - 1;
  return `${start}-${start + 1}`;
}

export default function QuarterlyReportWizard({ childId, childName, gradeLevel }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [schoolYear] = useState(currentSchoolYear());
  const [quarter, setQuarter] = useState<string>('fall');
  const [quarterLabel, setQuarterLabel] = useState('');
  const [asaHours, setAsaHours] = useState('');
  const [homeHours, setHomeHours] = useState('');
  const [draftNarrative, setDraftNarrative] = useState('');
  const [approvedNarrative, setApprovedNarrative] = useState('');
  const [phonogramCount, setPhonogramCount] = useState('');
  const [includeGuide, setIncludeGuide] = useState(true);
  const [lastSnapshotId, setLastSnapshotId] = useState<number | null>(null);

  const previewQuery = useQuery({
    queryKey: ['/api/progress/report', childId, schoolYear, quarter, 'preview'],
    queryFn: async () => {
      const res = await apiRequest(
        'GET',
        `/api/progress/report/${childId}?schoolYear=${encodeURIComponent(schoolYear)}&quarter=${quarter}&draft=true`,
      );
      return res.json();
    },
    enabled: !!childId,
  });

  const saveRubric = useMutation({
    mutationFn: async () => {
      await apiRequest('PUT', `/api/progress/quarterly-rubric/${childId}`, {
        schoolYear,
        quarter,
        quarterLabel: quarterLabel || `${quarter} ${schoolYear}`,
        asaCoopHours: asaHours ? parseFloat(asaHours) : null,
        homeInstructionHours: homeHours ? parseFloat(homeHours) : null,
        draftNarrative,
        approvedNarrative: approvedNarrative || null,
        phonogramCount: phonogramCount ? parseInt(phonogramCount, 10) : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/progress/report', childId] });
      toast({ title: 'Quarterly rubric saved' });
    },
    onError: (e: Error) => toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
  });

  const emailParent = useMutation({
    mutationFn: async (snapshotId: number) => {
      const res = await apiRequest('POST', `/api/progress/report/${childId}/email`, { snapshotId });
      return res.json();
    },
    onSuccess: (data: { sentTo?: string }) => {
      toast({ title: 'Email sent', description: data.sentTo ? `Sent to ${data.sentTo}` : 'NY | Progress report emailed to parent.' });
    },
    onError: (e: Error) => toast({ title: 'Email failed', description: e.message, variant: 'destructive' }),
  });

  const finalize = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/progress/report/${childId}/generate`, {
        schoolYear,
        quarter,
        quarterLabel: quarterLabel || undefined,
        includeGuide,
      });
      return res.json();
    },
    onSuccess: async (data: { snapshotId: number }) => {
      setLastSnapshotId(data.snapshotId);
      await downloadProgressReportPdf({
        childId,
        schoolYear,
        quarter,
        snapshotId: data.snapshotId,
        includeGuide,
      });
      toast({ title: 'NY | Progress report generated', description: 'PDF downloaded for district records.' });
      queryClient.invalidateQueries({ queryKey: ['/api/progress/report', childId, 'snapshots'] });
    },
    onError: (e: Error) => toast({ title: 'Generate failed', description: e.message, variant: 'destructive' }),
  });

  const completeness = previewQuery.data?.completeness;
  const band = previewQuery.data?.band;

  return (
    <Card data-testid="quarterly-report-wizard">
      <CardHeader>
        <CardTitle>NY | Progress report</CardTitle>
        <CardDescription>
          For {childName}
          {gradeLevel ? ` (${gradeLevel})` : ''} — IHIP-aligned quarterly notes. Approve narrative before generating.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Quarter</Label>
            <Select value={quarter} onValueChange={setQuarter}>
              <SelectTrigger data-testid="select-report-quarter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TERMS.map((q) => (
                  <SelectItem key={q} value={q}>
                    {q.charAt(0).toUpperCase() + q.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Quarter dates (label)</Label>
            <Input
              value={quarterLabel}
              onChange={(e) => setQuarterLabel(e.target.value)}
              placeholder="e.g. Sep 1 – Nov 15, 2025"
            />
          </div>
        </div>

        {band && (
          <p className="text-sm text-muted-foreground">
            Form band: <strong>{band}</strong> (from grade level). Parents list as instructor on IHIP — use Parent(s) unless noted.
          </p>
        )}

        {completeness && (
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>Completeness</span>
              <span>{completeness.percent}%</span>
            </div>
            <Progress value={completeness.percent} />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>ASA co-op hours this quarter</Label>
            <Input type="number" min={0} value={asaHours} onChange={(e) => setAsaHours(e.target.value)} />
          </div>
          <div>
            <Label>Home instruction hours</Label>
            <Input type="number" min={0} value={homeHours} onChange={(e) => setHomeHours(e.target.value)} />
          </div>
        </div>

        <div>
          <Label>Phonogram count (if applicable)</Label>
          <Input type="number" min={0} value={phonogramCount} onChange={(e) => setPhonogramCount(e.target.value)} />
        </div>

        <div>
          <Label>Draft — key material covered</Label>
          <Textarea rows={3} value={draftNarrative} onChange={(e) => setDraftNarrative(e.target.value)} />
        </div>

        <div>
          <Label>Approved narrative (required for district PDF)</Label>
          <Textarea
            rows={3}
            value={approvedNarrative}
            onChange={(e) => setApprovedNarrative(e.target.value)}
            placeholder="Copy from draft or write final text parents may submit."
            data-testid="textarea-approved-narrative"
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={includeGuide} onCheckedChange={(v) => setIncludeGuide(!!v)} />
          Include IHIP instructions page (recommended first time)
        </label>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => saveRubric.mutate()}
            disabled={saveRubric.isPending}
            data-testid="button-save-rubric"
          >
            {saveRubric.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save rubric
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              downloadProgressReportPdf({ childId, schoolYear, quarter, draft: true, includeGuide }).catch((e) =>
                toast({ title: 'Preview download failed', description: e.message, variant: 'destructive' }),
              )
            }
            data-testid="button-preview-report-pdf"
          >
            <FileDown className="h-4 w-4 mr-2" />
            Preview PDF (draft)
          </Button>
          <Button
            onClick={() => finalize.mutate()}
            disabled={finalize.isPending || !approvedNarrative.trim()}
            data-testid="button-finalize-report"
          >
            {finalize.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            Finalize & download
          </Button>
          {lastSnapshotId && (
            <Button
              variant="outline"
              onClick={() => emailParent.mutate(lastSnapshotId)}
              disabled={emailParent.isPending}
              data-testid="button-email-report"
            >
              {emailParent.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
              Email parent
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
