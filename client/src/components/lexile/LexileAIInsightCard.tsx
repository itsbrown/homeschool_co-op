import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Brain, CheckCircle, BookOpen, AlertCircle, TrendingUp } from 'lucide-react';

interface LexileInsight {
  gradeComparison: string;
  interpretation: string;
  nextGoals: string[];
  additionalBooks: string[];
  noData?: boolean;
  message?: string;
}

interface Props {
  childId: number;
}

export default function LexileAIInsightCard({ childId }: Props) {
  const { data, isLoading, error } = useQuery<LexileInsight>({
    queryKey: ['/api/lexile/insights/student', childId],
    enabled: !!childId,
    retry: false,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-600" />
            AI Reading Insights
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-600" />
            AI Reading Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <AlertCircle className="h-4 w-4" />
            <span>AI insights are temporarily unavailable. Please try again later.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (data.noData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-600" />
            AI Reading Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <BookOpen className="h-4 w-4" />
            <span>No lexile data recorded yet. Record reading data to generate AI insights.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-purple-600" />
          AI Reading Insights
        </CardTitle>
        <CardDescription>AI-generated analysis based on recorded Lexile data</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-2">
          <TrendingUp className="h-4 w-4 text-blue-500 mt-1 shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-700 mb-0.5">Grade Comparison</p>
            <p className="text-sm text-muted-foreground">{data.gradeComparison}</p>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <Brain className="h-4 w-4 text-purple-500 mt-1 shrink-0" />
          <div>
            <p className="text-sm font-medium text-purple-700 mb-0.5">Interpretation</p>
            <p className="text-sm text-muted-foreground">{data.interpretation}</p>
          </div>
        </div>

        {data.nextGoals && data.nextGoals.length > 0 && (
          <div>
            <p className="text-sm font-medium text-emerald-700 mb-2">Next Reading Goals</p>
            <ul className="space-y-1">
              {data.nextGoals.map((goal, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span>{goal}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.additionalBooks && data.additionalBooks.length > 0 && (
          <div>
            <p className="text-sm font-medium text-amber-700 mb-2">Recommended Books</p>
            <div className="flex flex-wrap gap-1">
              {data.additionalBooks.map((book, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  <BookOpen className="h-3 w-3 mr-1" />
                  {book}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
