import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, Brain, AlertCircle, BookOpen, Layers, HelpCircle } from 'lucide-react';
import StudentSearchSelect from './StudentSearchSelect';

interface Student {
  id: number;
  firstName: string;
  lastName: string;
  gradeLevel: string;
}

interface Tier {
  label: string;
  lexileRange: string;
  studentNames: string[];
  books: string[];
}

interface GroupSummary {
  tiers: Tier[];
  supportNeeded: string[];
  groupNarrative: string;
  message?: string;
}

export default function LexileGroupSummary() {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [summary, setSummary] = useState<GroupSummary | null>(null);

  const { data: allStudents = [] } = useQuery<Student[]>({
    queryKey: ['/api/lexile/students'],
  });

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (childIds: number[]) => {
      const response = await apiRequest('POST', '/api/lexile/insights/group', { childIds });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to generate group summary');
      }
      return response.json();
    },
    onSuccess: (data: GroupSummary) => {
      setSummary(data);
      setErrorMessage(null);
    },
    onError: (error: Error) => {
      setErrorMessage(error.message);
      setSummary(null);
    },
  });

  const handleSelectClass = () => {
    setSelectedIds(allStudents.map(s => s.id));
  };

  const handleAddStudent = (id: number | null) => {
    if (id && !selectedIds.includes(id)) {
      setSelectedIds(prev => [...prev, id]);
    }
  };

  const handleRemoveStudent = (id: number) => {
    setSelectedIds(prev => prev.filter(i => i !== id));
  };

  const selectedStudents = allStudents.filter(s => selectedIds.includes(s.id));

  const tierColors = [
    'bg-blue-50 border-blue-200',
    'bg-green-50 border-green-200',
    'bg-yellow-50 border-yellow-200',
    'bg-orange-50 border-orange-200',
    'bg-red-50 border-red-200',
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            Group Reading Level Summary
          </CardTitle>
          <CardDescription>Select students and generate an AI-powered reading level summary for the group</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <StudentSearchSelect
                onSelect={handleAddStudent}
                placeholder="Add a student to the group..."
              />
            </div>
            <Button variant="outline" onClick={handleSelectClass} disabled={allStudents.length === 0}>
              Select All ({allStudents.length})
            </Button>
          </div>

          {selectedStudents.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedStudents.map(s => (
                <Badge key={s.id} variant="secondary" className="flex items-center gap-1">
                  {s.firstName} {s.lastName}
                  <button onClick={() => handleRemoveStudent(s.id)} className="ml-1 hover:text-red-500 transition-colors">
                    &times;
                  </button>
                </Badge>
              ))}
            </div>
          )}

          <Button
            onClick={() => mutation.mutate(selectedIds)}
            disabled={selectedIds.length < 1 || mutation.isPending}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {mutation.isPending ? (
              <span className="flex items-center gap-2">
                <Brain className="h-4 w-4 animate-pulse" />
                Generating Summary...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Brain className="h-4 w-4" />
                Generate Summary ({selectedIds.length} students)
              </span>
            )}
          </Button>
        </CardContent>
      </Card>

      {mutation.isPending && (
        <Card>
          <CardContent className="py-8 space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
              <Brain className="h-4 w-4 animate-pulse text-blue-500" />
              Generating AI summary for {selectedIds.length} students...
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      )}

      {errorMessage && !mutation.isPending && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Unable to Generate Summary</AlertTitle>
          <AlertDescription>
            {errorMessage.toLowerCase().includes('unavailable') || errorMessage.toLowerCase().includes('service')
              ? 'AI insights are temporarily unavailable. Please try again in a few minutes.'
              : errorMessage}
          </AlertDescription>
        </Alert>
      )}

      {summary && !mutation.isPending && (
        <div className="space-y-4">
          {summary.tiers && summary.tiers.length > 0 && (
            <div>
              <h3 className="text-base font-semibold flex items-center gap-2 mb-3">
                <Layers className="h-4 w-4" />
                Reading Tiers
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {summary.tiers.map((tier, i) => (
                  <Card key={i} className={`border ${tierColors[i % tierColors.length]}`}>
                    <CardContent className="pt-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-sm">{tier.label}</p>
                        <Badge variant="outline" className="text-xs">{tier.lexileRange}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {tier.studentNames.map((name, j) => (
                          <Badge key={j} variant="secondary" className="text-xs">{name}</Badge>
                        ))}
                      </div>
                      {tier.books && tier.books.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground font-medium mb-1">Recommended Books:</p>
                          <ul className="text-xs space-y-0.5">
                            {tier.books.map((book, j) => (
                              <li key={j} className="flex items-center gap-1">
                                <BookOpen className="h-3 w-3 text-amber-500 shrink-0" />
                                {book}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {summary.supportNeeded && summary.supportNeeded.length > 0 && (
            <Alert className="border-orange-200 bg-orange-50">
              <HelpCircle className="h-4 w-4 text-orange-600" />
              <AlertTitle className="text-orange-700">Support Needed</AlertTitle>
              <AlertDescription>
                <ul className="space-y-1 mt-1">
                  {summary.supportNeeded.map((item, i) => (
                    <li key={i} className="text-sm text-orange-600">{item}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {summary.groupNarrative && (
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm font-medium text-muted-foreground mb-2">Group Summary</p>
                <p className="text-sm">{summary.groupNarrative}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
