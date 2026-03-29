import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  BookMarked, TrendingUp, BookOpen, Brain, CheckCircle, AlertCircle,
  ChevronDown, ChevronUp, BarChart2, Info, Clock,
} from 'lucide-react';
import { format } from 'date-fns';

interface LexileInsight {
  gradeComparison: string;
  interpretation: string;
  nextGoals: string[];
  additionalBooks: string[];
  noData?: boolean;
  message?: string;
}

interface AssessmentRecord {
  id: number;
  score: string;
  assessmentDate: string;
  notes: string | null;
  source: string;
}

interface Props {
  childId: number;
  currentLexileRange?: string | null;
  currentReadingGradeLevel?: string | null;
  currentBookList?: string | null;
  showAIInsights?: boolean;
}

export default function LexileProfileSection({
  childId,
  currentLexileRange,
  currentReadingGradeLevel,
  currentBookList,
  showAIInsights = true,
}: Props) {
  const [showHistory, setShowHistory] = useState(false);
  const [showInsights, setShowInsights] = useState(false);

  const hasCurrentData = currentLexileRange || currentReadingGradeLevel || currentBookList;

  const { data: insight, isLoading: insightLoading, error: insightError } = useQuery<LexileInsight>({
    queryKey: ['/api/lexile/insights/student', childId],
    enabled: showInsights && showAIInsights && !!childId,
    retry: false,
  });

  const { data: history = [], isLoading: historyLoading } = useQuery<AssessmentRecord[]>({
    queryKey: ['/api/lexile/history', childId],
    enabled: showHistory && !!childId,
    retry: false,
  });

  if (!hasCurrentData && !showAIInsights) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <BookMarked className="h-5 w-5 text-blue-600" />
            Reading Level (Lexile)
          </CardTitle>
          {!hasCurrentData && (
            <Badge variant="secondary" className="text-xs">No data recorded</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasCurrentData ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {currentLexileRange && (
                <div className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-md border border-blue-200">
                  <BarChart2 className="h-4 w-4" />
                  <span className="text-sm font-medium">Lexile Range: {currentLexileRange}</span>
                </div>
              )}
              {currentReadingGradeLevel && (
                <div className="flex items-center gap-1.5 bg-green-50 text-green-700 px-3 py-1.5 rounded-md border border-green-200">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-sm font-medium">Grade Level: {currentReadingGradeLevel}</span>
                </div>
              )}
            </div>

            {currentBookList && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
                <p className="text-xs font-medium text-amber-700 flex items-center gap-1 mb-1">
                  <BookOpen className="h-3.5 w-3.5" />
                  Current Book List
                </p>
                <p className="text-sm text-amber-800 leading-relaxed">{currentBookList}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Info className="h-4 w-4" />
            No Lexile reading data has been recorded for this student yet.
          </p>
        )}

        {/* Assessment History Timeline */}
        <div className="pt-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 -ml-2"
            onClick={() => setShowHistory(v => !v)}
          >
            <Clock className="h-4 w-4 mr-2" />
            {showHistory ? 'Hide' : 'Show'} Assessment History
            {showHistory ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
          </Button>

          {showHistory && (
            <div className="mt-3">
              {historyLoading && (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              )}

              {!historyLoading && history.length === 0 && (
                <p className="text-sm text-muted-foreground py-2">No assessment records found yet.</p>
              )}

              {!historyLoading && history.length > 0 && (
                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-blue-100" />
                  <div className="space-y-3">
                    {history.map((entry, i) => (
                      <div key={entry.id} className="flex gap-3 pl-9 relative">
                        <div className="absolute left-3 top-2 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-white shadow-sm" />
                        <div className="flex-1 bg-blue-50 border border-blue-100 rounded-lg p-3">
                          <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
                            <Badge variant="outline" className="text-xs border-blue-300 text-blue-700 bg-white">
                              <BookMarked className="h-3 w-3 mr-1" />
                              Lexile Reading Level
                            </Badge>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {format(new Date(entry.assessmentDate), 'MMM d, yyyy')}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-blue-800">{entry.score}</p>
                          {entry.notes && (
                            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{entry.notes}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* AI Insights */}
        {showAIInsights && (
          <div className="pt-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              className="text-purple-600 hover:text-purple-700 hover:bg-purple-50 -ml-2"
              onClick={() => setShowInsights(v => !v)}
            >
              <Brain className="h-4 w-4 mr-2" />
              {showInsights ? 'Hide' : 'Show'} AI Reading Insights
              {showInsights ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
            </Button>

            {showInsights && (
              <div className="mt-3 space-y-3">
                {insightLoading && (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-5/6" />
                  </div>
                )}

                {insightError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>AI Insights Unavailable</AlertTitle>
                    <AlertDescription>
                      Reading insights are temporarily unavailable. Please try again later.
                    </AlertDescription>
                  </Alert>
                )}

                {insight && !insightLoading && !insightError && (
                  <>
                    {insight.noData ? (
                      <Alert>
                        <Info className="h-4 w-4" />
                        <AlertDescription>
                          Record reading level data to generate AI insights for this student.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <div className="space-y-3 bg-purple-50 rounded-lg border border-purple-100 p-3">
                        {insight.gradeComparison && (
                          <div>
                            <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-1">Grade Comparison</p>
                            <p className="text-sm">{insight.gradeComparison}</p>
                          </div>
                        )}
                        {insight.interpretation && (
                          <div>
                            <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-1">Interpretation</p>
                            <p className="text-sm">{insight.interpretation}</p>
                          </div>
                        )}
                        {insight.nextGoals && insight.nextGoals.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-1">Next Goals</p>
                            <ul className="space-y-1">
                              {insight.nextGoals.map((goal, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm">
                                  <CheckCircle className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                                  {goal}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {insight.additionalBooks && insight.additionalBooks.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-1">Recommended Books</p>
                            <div className="flex flex-wrap gap-1">
                              {insight.additionalBooks.map((book, i) => (
                                <Badge key={i} variant="outline" className="text-xs border-purple-200 text-purple-700">
                                  <BookOpen className="h-3 w-3 mr-1" />
                                  {book}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
