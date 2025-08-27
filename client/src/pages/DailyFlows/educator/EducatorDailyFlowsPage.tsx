import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Clock, CheckCircle, Circle, BookOpen, Users, Calendar, ExternalLink, StickyNote } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface DailyFlowEntry {
  id: number;
  templateId?: number;
  classId: number;
  date: string;
  startTime: string;
  endTime: string;
  subject: string;
  lessonTitle: string;
  lessonDescription?: string;
  lessonLink?: string;
  materials?: string[];
  objectives?: string[];
  isCompleted: boolean;
  completedBy?: string;
  completedAt?: string;
  notes?: string;
  createdBy: string;
}

interface Class {
  id: number;
  className: string;
  subject: string;
  gradeLevel: string;
  scheduleDay: string;
  scheduleTime: string;
}

export default function EducatorDailyFlowsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [expandedEntry, setExpandedEntry] = useState<number | null>(null);
  const [entryNotes, setEntryNotes] = useState<{ [key: number]: string }>({});

  // Get educator's classes
  const { data: classes = [], isLoading: classesLoading } = useQuery({
    queryKey: ['/api/educator/classes'],
    select: (data: any) => Array.isArray(data) ? data : []
  });

  // Get today's daily flow entries for all educator's classes
  const { data: entries = [], isLoading: entriesLoading, refetch: refetchEntries } = useQuery({
    queryKey: ['/api/daily-flows/entries', selectedDate],
    queryFn: async () => {
      if (!classes.length) return [];
      
      // Get entries for all classes on the selected date
      const allEntries = [];
      for (const cls of classes) {
        try {
          const response = await fetch(`/api/daily-flows/entries?classId=${cls.id}&startDate=${selectedDate}&endDate=${selectedDate}`);
          if (response.ok) {
            const classEntries = await response.json();
            if (Array.isArray(classEntries)) {
              allEntries.push(...classEntries.map((entry: any) => ({
                ...entry,
                className: cls.className,
                classGrade: cls.gradeLevel
              })));
            }
          }
        } catch (error) {
          console.error(`Error fetching entries for class ${cls.id}:`, error);
        }
      }
      
      // Sort by start time
      return allEntries.sort((a, b) => a.startTime.localeCompare(b.startTime));
    },
    enabled: classes.length > 0
  });

  // Mark entry as completed
  const completeMutation = useMutation({
    mutationFn: async ({ entryId, notes }: { entryId: number; notes?: string }) => {
      const response = await fetch(`/api/daily-flows/entries/${entryId}/complete`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes })
      });
      
      if (!response.ok) {
        throw new Error('Failed to mark entry as completed');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/daily-flows/entries'] });
      toast({
        title: "Activity Completed",
        description: "Great job! Activity marked as complete.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to mark activity as complete. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Update entry notes
  const updateNotesMutation = useMutation({
    mutationFn: async ({ entryId, notes }: { entryId: number; notes: string }) => {
      const response = await fetch(`/api/daily-flows/entries/${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes })
      });
      
      if (!response.ok) {
        throw new Error('Failed to update notes');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/daily-flows/entries'] });
      toast({
        title: "Notes Saved",
        description: "Your notes have been saved successfully.",
      });
    }
  });

  const handleCompleteEntry = (entryId: number) => {
    const notes = entryNotes[entryId] || '';
    completeMutation.mutate({ entryId, notes });
  };

  const handleSaveNotes = (entryId: number) => {
    const notes = entryNotes[entryId] || '';
    updateNotesMutation.mutate({ entryId, notes });
  };

  const updateEntryNotes = (entryId: number, notes: string) => {
    setEntryNotes(prev => ({ ...prev, [entryId]: notes }));
  };

  // Calculate completion statistics
  const completedCount = entries.filter((entry: any) => entry.isCompleted).length;
  const totalCount = entries.length;
  const completionPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Get current time for progress tracking
  const getCurrentTimeStatus = (startTime: string, endTime: string) => {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    if (currentTime < startTime) return 'upcoming';
    if (currentTime >= startTime && currentTime <= endTime) return 'current';
    return 'past';
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour24 = parseInt(hours);
    const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
    const ampm = hour24 >= 12 ? 'PM' : 'AM';
    return `${hour12}:${minutes} ${ampm}`;
  };

  if (classesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!classes.length) {
    return (
      <div className="text-center py-12">
        <Users className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-semibold text-gray-900">No Classes Assigned</h3>
        <p className="mt-1 text-sm text-gray-500">
          You don't have any classes assigned yet. Please contact your administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with date picker and progress */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Daily Flow</h1>
            <p className="text-gray-600">Manage your daily teaching activities</p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-500" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="border rounded-md px-3 py-1 text-sm"
              />
            </div>
            
            {totalCount > 0 && (
              <div className="flex items-center gap-3">
                <div className="text-sm text-gray-600">
                  {completedCount}/{totalCount} completed
                </div>
                <div className="w-32">
                  <Progress value={completionPercentage} className="h-2" />
                </div>
                <div className="text-sm font-medium text-gray-900">
                  {completionPercentage}%
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Loading state */}
      {entriesLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}

      {/* No entries message */}
      {!entriesLoading && entries.length === 0 && (
        <div className="text-center py-12">
          <BookOpen className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-semibold text-gray-900">No Activities Scheduled</h3>
          <p className="mt-1 text-sm text-gray-500">
            No daily flow activities are scheduled for {selectedDate}.
          </p>
        </div>
      )}

      {/* Daily flow entries */}
      <div className="space-y-4">
        {entries.map((entry: any) => {
          const timeStatus = getCurrentTimeStatus(entry.startTime, entry.endTime);
          const isExpanded = expandedEntry === entry.id;
          const currentNotes = entryNotes[entry.id] !== undefined ? entryNotes[entry.id] : (entry.notes || '');
          
          return (
            <Card 
              key={entry.id} 
              className={cn(
                "transition-all duration-200",
                entry.isCompleted && "bg-green-50 border-green-200",
                timeStatus === 'current' && !entry.isCompleted && "bg-blue-50 border-blue-200",
                timeStatus === 'upcoming' && "border-gray-200"
              )}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="mt-1">
                      {entry.isCompleted ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : (
                        <Circle className="h-5 w-5 text-gray-400" />
                      )}
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <CardTitle className={cn(
                          "text-lg",
                          entry.isCompleted && "line-through text-gray-500"
                        )}>
                          {entry.lessonTitle}
                        </CardTitle>
                        <Badge variant={timeStatus === 'current' ? 'default' : 'secondary'}>
                          {formatTime(entry.startTime)} - {formatTime(entry.endTime)}
                        </Badge>
                        {timeStatus === 'current' && !entry.isCompleted && (
                          <Badge variant="default" className="bg-blue-600">
                            Current
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <BookOpen className="h-3 w-3" />
                          {entry.subject}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {entry.className} ({entry.classGrade})
                        </span>
                        {entry.completedAt && (
                          <span className="flex items-center gap-1 text-green-600">
                            <CheckCircle className="h-3 w-3" />
                            Completed at {formatTime(entry.completedAt.split('T')[1]?.substring(0, 5) || '')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedEntry(isExpanded ? null : entry.id)}
                    >
                      {isExpanded ? 'Less' : 'More'}
                    </Button>
                    
                    {!entry.isCompleted && (
                      <Button
                        size="sm"
                        onClick={() => handleCompleteEntry(entry.id)}
                        disabled={completeMutation.isPending}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        Mark Complete
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>

              {isExpanded && (
                <CardContent className="pt-0">
                  <div className="space-y-4">
                    {/* Lesson description */}
                    {entry.lessonDescription && (
                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">Description</h4>
                        <p className="text-gray-600 text-sm">{entry.lessonDescription}</p>
                      </div>
                    )}

                    {/* Learning objectives */}
                    {entry.objectives && entry.objectives.length > 0 && (
                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">Learning Objectives</h4>
                        <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
                          {entry.objectives.map((objective: string, index: number) => (
                            <li key={index}>{objective}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Materials */}
                    {entry.materials && entry.materials.length > 0 && (
                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">Materials Needed</h4>
                        <div className="flex flex-wrap gap-2">
                          {entry.materials.map((material: string, index: number) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {material}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Lesson link */}
                    {entry.lessonLink && (
                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">Resources</h4>
                        <a
                          href={entry.lessonLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Open lesson resource
                        </a>
                      </div>
                    )}

                    {/* Notes section */}
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                        <StickyNote className="h-4 w-4" />
                        Notes
                      </h4>
                      <Textarea
                        placeholder="Add notes about this activity..."
                        value={currentNotes}
                        onChange={(e) => updateEntryNotes(entry.id, e.target.value)}
                        className="min-h-[80px] text-sm"
                      />
                      {currentNotes !== (entry.notes || '') && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSaveNotes(entry.id)}
                          disabled={updateNotesMutation.isPending}
                          className="mt-2"
                        >
                          Save Notes
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}