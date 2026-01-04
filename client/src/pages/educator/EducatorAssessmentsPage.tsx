import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/components/SupabaseProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Plus, 
  Loader2,
  ClipboardCheck,
  BookOpen,
  Users,
  Search,
  Filter,
  ChevronDown
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import EducatorAppShell from '@/components/layout/EducatorAppShell';
import { 
  EducatorLoadingState, 
  EducatorEmptyState 
} from '@/components/educator/EducatorErrorBoundary';
import { format } from 'date-fns';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface AssessmentType {
  id: number;
  schoolId: number;
  name: string;
  description: string | null;
  category: string;
  scoreFormat: string;
  minScore: number | null;
  maxScore: number | null;
  passingScore: number | null;
  isActive: boolean;
}

interface CurriculumBook {
  id: number;
  assessmentTypeId: number;
  name: string;
  description: string | null;
  totalLessons: number | null;
  gradeLevel: string | null;
  isActive: boolean;
}

interface Child {
  id: number;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
}

interface StudentAssessment {
  id: number;
  childId: number;
  assessmentTypeId: number;
  curriculumBookId: number | null;
  lessonNumber: number | null;
  scoreValue: string | null;
  scoreNumeric: number | null;
  assessmentDate: string;
  notes: string | null;
  recordedBy: number;
  createdAt: string;
}

export default function EducatorAssessmentsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState('record');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  
  const [assessmentForm, setAssessmentForm] = useState({
    childId: '',
    assessmentTypeId: '',
    curriculumBookId: '',
    lessonNumber: '',
    scoreValue: '',
    scoreNumeric: '',
    assessmentDate: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
  });

  const { data: assessmentTypes = [], isLoading: typesLoading } = useQuery<AssessmentType[]>({
    queryKey: ['/api/assessments/types'],
    enabled: !!user?.email,
  });

  const selectedAssessmentType = assessmentTypes.find(t => t.id.toString() === assessmentForm.assessmentTypeId);

  const { data: curriculumBooks = [] } = useQuery<CurriculumBook[]>({
    queryKey: ['/api/assessments/types', assessmentForm.assessmentTypeId, 'books'],
    queryFn: async () => {
      if (!assessmentForm.assessmentTypeId) return [];
      const response = await fetch(`/api/assessments/types/${assessmentForm.assessmentTypeId}/books`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!assessmentForm.assessmentTypeId,
  });

  const { data: children = [], isLoading: childrenLoading } = useQuery<Child[]>({
    queryKey: ['/api/educator/students'],
    enabled: !!user?.email,
  });

  const { data: recentAssessments = [], isLoading: assessmentsLoading } = useQuery<StudentAssessment[]>({
    queryKey: ['/api/assessments/students'],
    enabled: !!user?.email,
  });

  const createAssessmentMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/assessments/students', data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to record assessment');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Assessment recorded successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/assessments/students'] });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setAssessmentForm({
      childId: '',
      assessmentTypeId: '',
      curriculumBookId: '',
      lessonNumber: '',
      scoreValue: '',
      scoreNumeric: '',
      assessmentDate: format(new Date(), 'yyyy-MM-dd'),
      notes: '',
    });
    setSelectedChild(null);
  };

  const openRecordDialog = (child?: Child) => {
    resetForm();
    if (child) {
      setSelectedChild(child);
      setAssessmentForm(prev => ({ ...prev, childId: child.id.toString() }));
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    const data = {
      childId: parseInt(assessmentForm.childId),
      assessmentTypeId: parseInt(assessmentForm.assessmentTypeId),
      curriculumBookId: assessmentForm.curriculumBookId ? parseInt(assessmentForm.curriculumBookId) : null,
      lessonNumber: assessmentForm.lessonNumber ? parseInt(assessmentForm.lessonNumber) : null,
      scoreValue: assessmentForm.scoreValue || null,
      scoreNumeric: assessmentForm.scoreNumeric ? parseFloat(assessmentForm.scoreNumeric) : null,
      assessmentDate: assessmentForm.assessmentDate,
      notes: assessmentForm.notes || null,
    };
    createAssessmentMutation.mutate(data);
  };

  const filteredChildren = children.filter(child => {
    const fullName = `${child.firstName} ${child.lastName}`.toLowerCase();
    return fullName.includes(searchQuery.toLowerCase());
  });

  const getAssessmentTypeName = (typeId: number) => {
    return assessmentTypes.find(t => t.id === typeId)?.name || 'Unknown';
  };

  const getChildName = (childId: number) => {
    const child = children.find(c => c.id === childId);
    return child ? `${child.firstName} ${child.lastName}` : 'Unknown';
  };

  const filteredAssessments = recentAssessments.filter(a => {
    if (selectedTypeFilter !== 'all' && a.assessmentTypeId.toString() !== selectedTypeFilter) {
      return false;
    }
    return true;
  });

  const getScoreFormatHelper = (format: string) => {
    switch (format) {
      case 'numeric': return 'Enter a number (e.g., 85)';
      case 'fraction': return 'Enter as fraction (e.g., 8/10)';
      case 'percentage': return 'Enter percentage (e.g., 85%)';
      case 'letter_grade': return 'Enter letter grade (e.g., A, B+)';
      case 'pass_fail': return 'Enter Pass or Fail';
      case 'level': return 'Enter level (e.g., 3, Advanced)';
      default: return 'Enter score value';
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="page-title">
              <ClipboardCheck className="h-6 w-6 text-emerald-600" />
              Student Assessments
            </h1>
            <p className="text-muted-foreground mt-1">
              Record scores and track student progress across different assessments
            </p>
          </div>
          <Button
            onClick={() => openRecordDialog()}
            className="bg-emerald-600 hover:bg-emerald-700"
            data-testid="button-record-assessment"
          >
            <Plus className="h-4 w-4 mr-2" />
            Record Assessment
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="record" className="flex items-center gap-2" data-testid="tab-record">
              <Users className="h-4 w-4" />
              Students
            </TabsTrigger>
            <TabsTrigger value="recent" className="flex items-center gap-2" data-testid="tab-recent">
              <ClipboardCheck className="h-4 w-4" />
              Recent Assessments
            </TabsTrigger>
          </TabsList>

          <TabsContent value="record" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Select Student</CardTitle>
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search students..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                      data-testid="input-search-students"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {childrenLoading ? (
                  <EducatorLoadingState message="Loading students..." />
                ) : filteredChildren.length === 0 ? (
                  <EducatorEmptyState
                    title="No Students Found"
                    description={searchQuery ? "No students match your search" : "No students available for assessment"}
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredChildren.map((child) => (
                      <Card
                        key={child.id}
                        className="cursor-pointer hover:border-emerald-500 transition-colors"
                        onClick={() => openRecordDialog(child)}
                        data-testid={`card-student-${child.id}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{child.firstName} {child.lastName}</p>
                              {child.dateOfBirth && (
                                <p className="text-sm text-muted-foreground">
                                  {format(new Date(child.dateOfBirth), 'MMM d, yyyy')}
                                </p>
                              )}
                            </div>
                            <Button size="sm" variant="outline" data-testid={`button-record-${child.id}`}>
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="recent" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Recent Assessments</CardTitle>
                  <Collapsible open={showFilters} onOpenChange={setShowFilters}>
                    <CollapsibleTrigger asChild>
                      <Button variant="outline" size="sm" data-testid="button-toggle-filters">
                        <Filter className="h-4 w-4 mr-2" />
                        Filters
                        <ChevronDown className={`h-4 w-4 ml-2 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="absolute right-0 mt-2 bg-background border rounded-lg p-4 shadow-lg z-10">
                      <div className="space-y-3">
                        <div>
                          <Label>Assessment Type</Label>
                          <Select value={selectedTypeFilter} onValueChange={setSelectedTypeFilter}>
                            <SelectTrigger className="w-48" data-testid="select-type-filter">
                              <SelectValue placeholder="All types" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Types</SelectItem>
                              {assessmentTypes.map(type => (
                                <SelectItem key={type.id} value={type.id.toString()}>
                                  {type.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </CardHeader>
              <CardContent>
                {assessmentsLoading ? (
                  <EducatorLoadingState message="Loading assessments..." />
                ) : filteredAssessments.length === 0 ? (
                  <EducatorEmptyState
                    title="No Assessments Recorded"
                    description="Start by recording a student assessment"
                  />
                ) : (
                  <div className="space-y-3">
                    {filteredAssessments.slice(0, 20).map((assessment) => (
                      <div
                        key={assessment.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                        data-testid={`card-assessment-${assessment.id}`}
                      >
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                            <BookOpen className="h-5 w-5 text-emerald-600" />
                          </div>
                          <div>
                            <p className="font-medium">{getChildName(assessment.childId)}</p>
                            <p className="text-sm text-muted-foreground">
                              {getAssessmentTypeName(assessment.assessmentTypeId)}
                              {assessment.lessonNumber && ` • Lesson ${assessment.lessonNumber}`}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge variant="outline" className="text-lg font-mono">
                            {assessment.scoreValue || assessment.scoreNumeric || '—'}
                          </Badge>
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(assessment.assessmentDate), 'MMM d, yyyy')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Record Assessment</DialogTitle>
              <DialogDescription>
                {selectedChild 
                  ? `Recording assessment for ${selectedChild.firstName} ${selectedChild.lastName}`
                  : 'Record a new student assessment'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {!selectedChild && (
                <div>
                  <Label htmlFor="childId">Student *</Label>
                  <Select
                    value={assessmentForm.childId}
                    onValueChange={(value) => setAssessmentForm({ ...assessmentForm, childId: value })}
                  >
                    <SelectTrigger data-testid="select-student">
                      <SelectValue placeholder="Select student" />
                    </SelectTrigger>
                    <SelectContent>
                      {children.map(child => (
                        <SelectItem key={child.id} value={child.id.toString()}>
                          {child.firstName} {child.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label htmlFor="assessmentTypeId">Assessment Type *</Label>
                <Select
                  value={assessmentForm.assessmentTypeId}
                  onValueChange={(value) => setAssessmentForm({ 
                    ...assessmentForm, 
                    assessmentTypeId: value,
                    curriculumBookId: '',
                  })}
                >
                  <SelectTrigger data-testid="select-assessment-type">
                    <SelectValue placeholder="Select assessment type" />
                  </SelectTrigger>
                  <SelectContent>
                    {assessmentTypes.filter(t => t.isActive).map(type => (
                      <SelectItem key={type.id} value={type.id.toString()}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {curriculumBooks.length > 0 && (
                <div>
                  <Label htmlFor="curriculumBookId">Curriculum Book</Label>
                  <Select
                    value={assessmentForm.curriculumBookId}
                    onValueChange={(value) => setAssessmentForm({ ...assessmentForm, curriculumBookId: value })}
                  >
                    <SelectTrigger data-testid="select-curriculum-book">
                      <SelectValue placeholder="Select book (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {curriculumBooks.filter(b => b.isActive).map(book => (
                        <SelectItem key={book.id} value={book.id.toString()}>
                          {book.name}
                          {book.gradeLevel && ` (Grade ${book.gradeLevel})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="lessonNumber">Lesson Number</Label>
                  <Input
                    id="lessonNumber"
                    type="number"
                    value={assessmentForm.lessonNumber}
                    onChange={(e) => setAssessmentForm({ ...assessmentForm, lessonNumber: e.target.value })}
                    placeholder="e.g., 15"
                    data-testid="input-lesson-number"
                  />
                </div>
                <div>
                  <Label htmlFor="assessmentDate">Date</Label>
                  <Input
                    id="assessmentDate"
                    type="date"
                    value={assessmentForm.assessmentDate}
                    onChange={(e) => setAssessmentForm({ ...assessmentForm, assessmentDate: e.target.value })}
                    data-testid="input-assessment-date"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="scoreValue">Score (Text)</Label>
                  <Input
                    id="scoreValue"
                    value={assessmentForm.scoreValue}
                    onChange={(e) => setAssessmentForm({ ...assessmentForm, scoreValue: e.target.value })}
                    placeholder={selectedAssessmentType ? getScoreFormatHelper(selectedAssessmentType.scoreFormat) : 'Enter score'}
                    data-testid="input-score-value"
                  />
                  {selectedAssessmentType && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Format: {selectedAssessmentType.scoreFormat}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="scoreNumeric">Score (Numeric)</Label>
                  <Input
                    id="scoreNumeric"
                    type="number"
                    value={assessmentForm.scoreNumeric}
                    onChange={(e) => setAssessmentForm({ ...assessmentForm, scoreNumeric: e.target.value })}
                    placeholder="e.g., 85"
                    data-testid="input-score-numeric"
                  />
                  {selectedAssessmentType?.minScore != null && selectedAssessmentType?.maxScore != null && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Range: {selectedAssessmentType.minScore} - {selectedAssessmentType.maxScore}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={assessmentForm.notes}
                  onChange={(e) => setAssessmentForm({ ...assessmentForm, notes: e.target.value })}
                  placeholder="Add any notes about this assessment..."
                  rows={3}
                  data-testid="input-notes"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} data-testid="button-cancel">
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={
                  !assessmentForm.childId || 
                  !assessmentForm.assessmentTypeId || 
                  (!assessmentForm.scoreValue && !assessmentForm.scoreNumeric) ||
                  createAssessmentMutation.isPending
                }
                className="bg-emerald-600 hover:bg-emerald-700"
                data-testid="button-save-assessment"
              >
                {createAssessmentMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Save Assessment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
