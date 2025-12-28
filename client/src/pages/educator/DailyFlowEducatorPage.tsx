import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Calendar, Clock, CheckCircle, Edit, Link, FileText } from 'lucide-react';
import { DailyFlowEntry } from '@shared/daily-flow-schema';
import { apiRequest } from '@/lib/queryClient';

interface ClassItem {
  id: number;
  title: string;
}

export default function DailyFlowEducatorPage() {
  const queryClient = useQueryClient();
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [editingEntry, setEditingEntry] = useState<DailyFlowEntry | null>(null);
  const [completionNotes, setCompletionNotes] = useState('');

  const { data: classes = [] } = useQuery<ClassItem[]>({
    queryKey: ['/api/educator/classes'],
  });

  const { data: dailyFlows = [] } = useQuery<DailyFlowEntry[]>({
    queryKey: [`/api/daily-flows/entries?classId=${selectedClass?.id}&startDate=${selectedDate}&endDate=${selectedDate}`],
    enabled: !!selectedClass,
  });

  const completeEntryMutation = useMutation({
    mutationFn: async ({ entryId, notes }: { entryId: number; notes: string }) => {
      return apiRequest('PATCH', `/api/daily-flows/entries/${entryId}/complete`, { notes });
    },
    onSuccess: () => {
      setCompletionNotes('');
      queryClient.invalidateQueries({ queryKey: [`/api/daily-flows/entries?classId=${selectedClass?.id}&startDate=${selectedDate}&endDate=${selectedDate}`] });
    },
  });

  const updateEntryMutation = useMutation({
    mutationFn: async (entry: DailyFlowEntry) => {
      return apiRequest('PATCH', `/api/daily-flows/entries/${entry.id}`, {
        startTime: entry.startTime,
        endTime: entry.endTime,
        lessonTitle: entry.lessonTitle,
        lessonDescription: entry.lessonDescription,
        lessonLink: entry.lessonLink,
        notes: entry.notes,
      });
    },
    onSuccess: () => {
      setEditingEntry(null);
      queryClient.invalidateQueries({ queryKey: [`/api/daily-flows/entries?classId=${selectedClass?.id}&startDate=${selectedDate}&endDate=${selectedDate}`] });
    },
  });

  const handleCompleteEntry = (entryId: number) => {
    completeEntryMutation.mutate({ entryId, notes: completionNotes });
  };

  const handleUpdateEntry = () => {
    if (!editingEntry) return;
    updateEntryMutation.mutate(editingEntry);
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">My Daily Flows</h1>
        <p className="text-muted-foreground">View and manage your daily lesson flows</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Select Class</CardTitle>
          </CardHeader>
          <CardContent>
            <select
              className="w-full p-2 border rounded"
              onChange={(e) => setSelectedClass(classes.find(c => c.id.toString() === e.target.value))}
            >
              <option value="">Choose a class</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.title}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Select Date</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </CardContent>
        </Card>
      </div>

      {selectedClass && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Calendar className="h-5 w-5 mr-2" />
              {selectedClass.title} - {new Date(selectedDate).toLocaleDateString()}
            </CardTitle>
            <CardDescription>
              Today's lesson flow
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {dailyFlows.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No daily flow entries for this date.
                </div>
              ) : (
                dailyFlows
                  .sort((a, b) => a.startTime.localeCompare(b.startTime))
                  .map((entry) => (
                    <Card key={entry.id} className={`border-l-4 ${entry.isCompleted ? 'border-l-green-500' : 'border-l-blue-500'}`}>
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-4 mb-2">
                              <Badge variant="outline" className="flex items-center">
                                <Clock className="h-3 w-3 mr-1" />
                                {entry.startTime} - {entry.endTime}
                              </Badge>
                              <Badge variant="secondary">{entry.subject}</Badge>
                              {entry.isCompleted && (
                                <Badge variant="default" className="bg-green-500">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Completed
                                </Badge>
                              )}
                            </div>
                            
                            <h4 className="font-semibold text-lg">{entry.lessonTitle}</h4>
                            {entry.lessonDescription && (
                              <p className="text-muted-foreground mt-1">{entry.lessonDescription}</p>
                            )}
                            
                            {entry.lessonLink && (
                              <a
                                href={entry.lessonLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center text-blue-600 hover:text-blue-800 mt-2"
                              >
                                <Link className="h-4 w-4 mr-1" />
                                Open Lesson
                              </a>
                            )}

                            {entry.objectives && entry.objectives.length > 0 && (
                              <div className="mt-2">
                                <h5 className="font-medium text-sm">Objectives:</h5>
                                <ul className="list-disc list-inside text-sm text-muted-foreground">
                                  {entry.objectives.map((obj, index) => (
                                    <li key={index}>{obj}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {entry.materials && entry.materials.length > 0 && (
                              <div className="mt-2">
                                <h5 className="font-medium text-sm">Materials:</h5>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {entry.materials.map((material, index) => (
                                    <Badge key={index} variant="outline" className="text-xs">
                                      {material}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                            {entry.isCompleted && entry.completedBy && (
                              <div className="mt-2 text-sm text-muted-foreground">
                                Completed by {entry.completedBy} at {new Date(entry.completedAt).toLocaleString()}
                                {entry.notes && <p className="mt-1 italic">Notes: {entry.notes}</p>}
                              </div>
                            )}
                          </div>

                          <div className="flex space-x-2">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setEditingEntry(entry)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Edit Lesson Entry</DialogTitle>
                                  <DialogDescription>
                                    Modify lesson details and timing
                                  </DialogDescription>
                                </DialogHeader>
                                
                                {editingEntry && (
                                  <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <label className="text-sm font-medium">Start Time</label>
                                        <Input
                                          type="time"
                                          value={editingEntry.startTime}
                                          onChange={(e) => setEditingEntry(prev => prev ? { ...prev, startTime: e.target.value } : null)}
                                        />
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium">End Time</label>
                                        <Input
                                          type="time"
                                          value={editingEntry.endTime}
                                          onChange={(e) => setEditingEntry(prev => prev ? { ...prev, endTime: e.target.value } : null)}
                                        />
                                      </div>
                                    </div>

                                    <div>
                                      <label className="text-sm font-medium">Lesson Title</label>
                                      <Input
                                        value={editingEntry.lessonTitle}
                                        onChange={(e) => setEditingEntry(prev => prev ? { ...prev, lessonTitle: e.target.value } : null)}
                                      />
                                    </div>

                                    <div>
                                      <label className="text-sm font-medium">Description</label>
                                      <Textarea
                                        value={editingEntry.lessonDescription || ''}
                                        onChange={(e) => setEditingEntry(prev => prev ? { ...prev, lessonDescription: e.target.value } : null)}
                                      />
                                    </div>

                                    <div>
                                      <label className="text-sm font-medium">Lesson Link</label>
                                      <Input
                                        type="url"
                                        value={editingEntry.lessonLink || ''}
                                        onChange={(e) => setEditingEntry(prev => prev ? { ...prev, lessonLink: e.target.value } : null)}
                                      />
                                    </div>

                                    <div className="flex justify-end space-x-2">
                                      <Button variant="outline" onClick={() => setEditingEntry(null)}>
                                        Cancel
                                      </Button>
                                      <Button onClick={handleUpdateEntry}>
                                        Save Changes
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </DialogContent>
                            </Dialog>
                            
                            {!entry.isCompleted && (
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="default" size="sm">
                                    <CheckCircle className="h-4 w-4 mr-1" />
                                    Complete
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Mark as Completed</DialogTitle>
                                    <DialogDescription>
                                      Add any notes about the lesson completion
                                    </DialogDescription>
                                  </DialogHeader>
                                  
                                  <div className="space-y-4">
                                    <Textarea
                                      placeholder="Optional notes about the lesson..."
                                      value={completionNotes}
                                      onChange={(e) => setCompletionNotes(e.target.value)}
                                    />
                                    
                                    <div className="flex justify-end space-x-2">
                                      <Button variant="outline" onClick={() => setCompletionNotes('')}>
                                        Cancel
                                      </Button>
                                      <Button onClick={() => handleCompleteEntry(entry.id)}>
                                        Mark Complete
                                      </Button>
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
