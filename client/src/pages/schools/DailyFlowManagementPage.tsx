
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Clock, CheckCircle, Plus, Edit, Link } from 'lucide-react';
import { DailyFlowEntry, DailyFlowTemplate } from '@shared/daily-flow-schema';

export default function DailyFlowManagementPage() {
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [dailyFlows, setDailyFlows] = useState<DailyFlowEntry[]>([]);
  const [templates, setTemplates] = useState<DailyFlowTemplate[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<DailyFlowEntry | null>(null);

  const [newEntry, setNewEntry] = useState({
    startTime: '',
    endTime: '',
    subject: '',
    lessonTitle: '',
    lessonDescription: '',
    lessonLink: '',
    objectives: [''],
    materials: ['']
  });

  useEffect(() => {
    fetchClasses();
    fetchTemplates();
  }, []);

  useEffect(() => {
    if (selectedClass) {
      fetchDailyFlows();
    }
  }, [selectedClass, selectedDate]);

  const fetchClasses = async () => {
    try {
      const response = await fetch('/api/school-admin/classes', {
        credentials: 'include'
      });
      const data = await response.json();
      setClasses(data.classes || []);
    } catch (error) {
      console.error('Error fetching classes:', error);
    }
  };

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/daily-flows/templates', {
        credentials: 'include'
      });
      const data = await response.json();
      setTemplates(data);
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  };

  const fetchDailyFlows = async () => {
    if (!selectedClass) return;

    try {
      const response = await fetch(`/api/daily-flows/entries?classId=${selectedClass.id}&startDate=${selectedDate}&endDate=${selectedDate}`, {
        credentials: 'include'
      });
      const data = await response.json();
      setDailyFlows(data);
    } catch (error) {
      console.error('Error fetching daily flows:', error);
    }
  };

  const handleCreateEntry = async () => {
    if (!selectedClass) return;

    try {
      const response = await fetch('/api/daily-flows/entries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          ...newEntry,
          classId: selectedClass.id,
          date: selectedDate,
          objectives: newEntry.objectives.filter(obj => obj.trim()),
          materials: newEntry.materials.filter(mat => mat.trim())
        })
      });

      if (response.ok) {
        setIsCreateDialogOpen(false);
        setNewEntry({
          startTime: '',
          endTime: '',
          subject: '',
          lessonTitle: '',
          lessonDescription: '',
          lessonLink: '',
          objectives: [''],
          materials: ['']
        });
        fetchDailyFlows();
      }
    } catch (error) {
      console.error('Error creating daily flow entry:', error);
    }
  };

  const handleCompleteEntry = async (entryId: number, notes?: string) => {
    try {
      const response = await fetch(`/api/daily-flows/entries/${entryId}/complete`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ notes })
      });

      if (response.ok) {
        fetchDailyFlows();
      }
    } catch (error) {
      console.error('Error completing entry:', error);
    }
  };

  const handleUpdateEntry = async (entryId: number, updateData: Partial<DailyFlowEntry>) => {
    try {
      const response = await fetch(`/api/daily-flows/entries/${entryId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(updateData)
      });

      if (response.ok) {
        setEditingEntry(null);
        fetchDailyFlows();
      }
    } catch (error) {
      console.error('Error updating entry:', error);
    }
  };

  const addObjectiveField = () => {
    setNewEntry(prev => ({
      ...prev,
      objectives: [...prev.objectives, '']
    }));
  };

  const addMaterialField = () => {
    setNewEntry(prev => ({
      ...prev,
      materials: [...prev.materials, '']
    }));
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Daily Flow Management</h1>
        <p className="text-muted-foreground">Manage daily lesson plans and track completion</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Select Class</CardTitle>
          </CardHeader>
          <CardContent>
            <Select onValueChange={(value) => setSelectedClass(classes.find(c => c.id.toString() === value))}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id.toString()}>
                    {cls.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="w-full" disabled={!selectedClass}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Flow Entry
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create Daily Flow Entry</DialogTitle>
                  <DialogDescription>
                    Add a new lesson or activity to the daily flow
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Start Time</label>
                      <Input
                        type="time"
                        value={newEntry.startTime}
                        onChange={(e) => setNewEntry(prev => ({ ...prev, startTime: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">End Time</label>
                      <Input
                        type="time"
                        value={newEntry.endTime}
                        onChange={(e) => setNewEntry(prev => ({ ...prev, endTime: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Subject</label>
                    <Input
                      value={newEntry.subject}
                      onChange={(e) => setNewEntry(prev => ({ ...prev, subject: e.target.value }))}
                      placeholder="e.g., Literacy, Mathematics"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">Lesson Title</label>
                    <Input
                      value={newEntry.lessonTitle}
                      onChange={(e) => setNewEntry(prev => ({ ...prev, lessonTitle: e.target.value }))}
                      placeholder="e.g., ir,er,ar,ear"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">Lesson Description</label>
                    <Textarea
                      value={newEntry.lessonDescription}
                      onChange={(e) => setNewEntry(prev => ({ ...prev, lessonDescription: e.target.value }))}
                      placeholder="Detailed description of the lesson"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">Lesson Link</label>
                    <Input
                      type="url"
                      value={newEntry.lessonLink}
                      onChange={(e) => setNewEntry(prev => ({ ...prev, lessonLink: e.target.value }))}
                      placeholder="https://..."
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">Learning Objectives</label>
                    {newEntry.objectives.map((objective, index) => (
                      <Input
                        key={index}
                        value={objective}
                        onChange={(e) => {
                          const newObjectives = [...newEntry.objectives];
                          newObjectives[index] = e.target.value;
                          setNewEntry(prev => ({ ...prev, objectives: newObjectives }));
                        }}
                        placeholder="Learning objective"
                        className="mt-2"
                      />
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={addObjectiveField} className="mt-2">
                      Add Objective
                    </Button>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Materials</label>
                    {newEntry.materials.map((material, index) => (
                      <Input
                        key={index}
                        value={material}
                        onChange={(e) => {
                          const newMaterials = [...newEntry.materials];
                          newMaterials[index] = e.target.value;
                          setNewEntry(prev => ({ ...prev, materials: newMaterials }));
                        }}
                        placeholder="Required material"
                        className="mt-2"
                      />
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={addMaterialField} className="mt-2">
                      Add Material
                    </Button>
                  </div>

                  <div className="flex justify-end space-x-2">
                    <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateEntry}>
                      Create Entry
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
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
              Daily flow for {selectedDate}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {dailyFlows.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No daily flow entries for this date. Create your first entry above.
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
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingEntry(entry)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            
                            {!entry.isCompleted && (
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => handleCompleteEntry(entry.id)}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Complete
                              </Button>
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
