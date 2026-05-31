import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import ProgressLogForm from './ProgressLogForm';

export default function ProgressLogTab() {
  const { data: recent = [], isLoading } = useQuery({
    queryKey: ['/api/progress/log/recent'],
    queryFn: async () => {
      const res = await fetch('/api/progress/log/recent?limit=20', { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
  });

  return (
    <Tabs defaultValue="log">
      <TabsList>
        <TabsTrigger value="log" data-testid="progress-subtab-log">Log progress</TabsTrigger>
        <TabsTrigger value="recent" data-testid="progress-subtab-recent">Recent</TabsTrigger>
      </TabsList>
      <TabsContent value="log" className="mt-4">
        <ProgressLogForm />
      </TabsContent>
      <TabsContent value="recent" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Recent progress entries</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : recent.length === 0 ? (
              <p className="text-muted-foreground">No progress logged yet.</p>
            ) : (
              <div className="space-y-3">
                {recent.map((row: any) => (
                  <div key={row.log.id} className="flex justify-between border rounded-lg p-3">
                    <div>
                      <p className="font-medium">
                        {row.child.firstName} {row.child.lastName}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {row.subject.label} • {row.track.name}
                        {row.log.lessonNumber != null && ` • Lesson ${row.log.lessonNumber}`}
                      </p>
                      {row.log.topicsSummary && (
                        <p className="text-sm mt-1">{row.log.topicsSummary}</p>
                      )}
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <Badge variant="outline">{format(new Date(row.log.eventDate), 'MMM d, yyyy')}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
