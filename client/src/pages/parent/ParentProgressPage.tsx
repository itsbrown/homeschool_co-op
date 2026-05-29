import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ParentAppShell from '@/components/layout/ParentAppShell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, TrendingUp, BookOpen } from 'lucide-react';
import { safeFormatDate } from '@/utils/safeFormatDate';
import { Link } from 'wouter';

function ProgressSummaryCard({ childId }: { childId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['/api/progress/insights/summary', childId],
    queryFn: async () => {
      const res = await fetch(`/api/progress/insights/summary/${childId}`, { credentials: 'include' });
      return res.json();
    },
    enabled: !!childId,
  });

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  if (data?.noData) {
    return <p className="text-muted-foreground text-sm">{data.summary}</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed">{data?.summary}</p>
      {data?.nextSteps?.length > 0 && (
        <ul className="text-sm list-disc pl-5 space-y-1">
          {data.nextSteps.map((s: string, i: number) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ParentProgressPage() {
  const { data: progressData = [], isLoading } = useQuery({
    queryKey: ['/api/progress/parent/my-children'],
  });

  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  const activeChildId = selectedChildId ?? progressData[0]?.child?.id ?? null;
  const activeChild = progressData.find((p: any) => p.child.id === activeChildId);

  return (
    <ParentAppShell>
      <div className="space-y-6 max-w-5xl mx-auto p-4">
        <div>
          <h1 className="text-2xl font-bold">My Child&apos;s Progress</h1>
          <p className="text-muted-foreground">See where your children are across subjects and reading growth.</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          </div>
        ) : progressData.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Progress will appear here once educators log updates for your children.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-4">
              <Select
                value={activeChildId ? String(activeChildId) : ''}
                onValueChange={(v) => setSelectedChildId(parseInt(v))}
              >
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select child" />
                </SelectTrigger>
                <SelectContent>
                  {progressData.map((p: any) => (
                    <SelectItem key={p.child.id} value={String(p.child.id)}>
                      {p.child.firstName} {p.child.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {activeChild && (
              <Card className="border-emerald-200 bg-emerald-50/30">
                <CardHeader>
                  <CardTitle className="text-lg">Progress summary</CardTitle>
                  <CardDescription>
                    {activeChild.child.firstName} {activeChild.child.lastName} • {activeChild.child.gradeLevel}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ProgressSummaryCard childId={activeChild.child.id} />
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {activeChild?.current?.map((row: any) => (
                <Card key={row.current.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">{row.subject.label}</CardTitle>
                    <CardDescription className="text-xs">{row.track.name}</CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm space-y-1">
                    {row.current.lessonNumber != null && (
                      <p><TrendingUp className="inline h-3 w-3 mr-1" />Lesson {row.current.lessonNumber}</p>
                    )}
                    {row.current.unitLabel && <p>{row.current.unitLabel}</p>}
                    {row.current.topicsSummary && (
                      <p className="text-muted-foreground line-clamp-2">{row.current.topicsSummary}</p>
                    )}
                    <Badge variant="secondary" className="text-xs">On track</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="session">This session</TabsTrigger>
                <TabsTrigger value="reading">Reading</TabsTrigger>
              </TabsList>
              <TabsContent value="overview" className="mt-4 space-y-3">
                {activeChild?.current?.length === 0 && (
                  <p className="text-muted-foreground">No subject progress recorded yet.</p>
                )}
              </TabsContent>
              <TabsContent value="session" className="mt-4">
                {activeChild?.sessions?.map((sess: any) => (
                  <Card key={sess.sessionId} className="mb-4">
                    <CardHeader>
                      <CardTitle className="text-base">{sess.sessionName}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {sess.logs.map((entry: any) => (
                        <div key={entry.log.id} className="border-l-2 border-emerald-500 pl-3 py-1">
                          <p className="text-sm font-medium">{entry.subject.label} — {entry.track.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {safeFormatDate(entry.log.eventDate, 'MMM d, yyyy')}
                          </p>
                          <p className="text-sm">{entry.log.topicsSummary || JSON.stringify(entry.log.topicsCovered)}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>
              <TabsContent value="reading" className="mt-4">
                <Card>
                  <CardContent className="py-6">
                    <p className="text-sm text-muted-foreground mb-4">
                      View reading assessment charts, Lexile growth, and assessment history.
                    </p>
                    <Link href="/parent/assessments">
                      <a className="inline-flex items-center gap-2 text-emerald-600 font-medium hover:underline">
                        <BookOpen className="h-4 w-4" /> Open reading assessments
                      </a>
                    </Link>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </ParentAppShell>
  );
}
