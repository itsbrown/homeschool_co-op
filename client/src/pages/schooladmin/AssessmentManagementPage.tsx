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
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Plus, 
  Pencil, 
  Trash2, 
  Loader2,
  BookOpen,
  ClipboardList,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Users,
  Calendar,
  Search
} from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import AppShell from '@/components/layout/AppShell';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

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
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface CurriculumBook {
  id: number;
  assessmentTypeId: number;
  name: string;
  description: string | null;
  totalLessons: number | null;
  gradeLevel: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface StudentAssessment {
  id: number;
  schoolId: number;
  childId: number;
  assessmentTypeId: number;
  curriculumBookId: number | null;
  assessmentDate: string;
  score: string;
  lexileScore: number | null;
  lesson: number | null;
  notes: string | null;
  source: string;
  recordedBy: number;
  child?: { firstName: string; lastName: string };
  assessmentType?: { name: string };
  curriculumBook?: { name: string } | null;
  recorder?: { firstName: string; lastName: string };
}

interface Child {
  id: number;
  firstName: string;
  lastName: string;
}

interface Location {
  id: number;
  name: string;
}

const scoreFormatOptions = [
  { value: 'numeric', label: 'Numeric Score' },
  { value: 'fraction', label: 'Fraction (e.g., 8/10)' },
  { value: 'level', label: 'Level-based' },
  { value: 'percentage', label: 'Percentage' },
  { value: 'letter_grade', label: 'Letter Grade' },
  { value: 'pass_fail', label: 'Pass/Fail' },
  { value: 'custom', label: 'Custom' },
];

const categoryOptions = [
  { value: 'reading', label: 'Reading' },
  { value: 'phonics', label: 'Phonics' },
  { value: 'math', label: 'Math' },
  { value: 'writing', label: 'Writing' },
  { value: 'science', label: 'Science' },
  { value: 'history', label: 'History' },
  { value: 'language_arts', label: 'Language Arts' },
  { value: 'foreign_language', label: 'Foreign Language' },
  { value: 'other', label: 'Other' },
];

export default function AssessmentManagementPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState('types');
  const [expandedTypes, setExpandedTypes] = useState<Set<number>>(new Set());
  
  const [isTypeDialogOpen, setIsTypeDialogOpen] = useState(false);
  const [isBookDialogOpen, setIsBookDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<AssessmentType | null>(null);
  const [editingBook, setEditingBook] = useState<CurriculumBook | null>(null);
  const [selectedTypeForBook, setSelectedTypeForBook] = useState<number | null>(null);
  
  const [typeForm, setTypeForm] = useState({
    name: '',
    description: '',
    category: 'reading',
    scoreFormat: 'numeric',
    minScore: '',
    maxScore: '',
    passingScore: '',
    isActive: true,
  });
  
  const [bookForm, setBookForm] = useState({
    name: '',
    description: '',
    totalLessons: '',
    gradeLevel: '',
    isActive: true,
  });
  
  const [assessmentFilters, setAssessmentFilters] = useState({
    childId: 'all-students',
    assessmentTypeId: 'all-types',
    locationId: 'all-locations',
    searchQuery: ''
  });

  const { data: assessmentTypes = [], isLoading: typesLoading } = useQuery<AssessmentType[]>({
    queryKey: ['/api/assessments/types'],
    enabled: !!user?.email,
  });
  
  const { data: allStudentAssessments = [], isLoading: assessmentsLoading } = useQuery<StudentAssessment[]>({
    queryKey: ['/api/assessments/students', assessmentFilters.childId, assessmentFilters.assessmentTypeId, assessmentFilters.locationId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (assessmentFilters.childId && assessmentFilters.childId !== 'all-students') params.append('childId', assessmentFilters.childId);
      if (assessmentFilters.assessmentTypeId && assessmentFilters.assessmentTypeId !== 'all-types') params.append('assessmentTypeId', assessmentFilters.assessmentTypeId);
      if (assessmentFilters.locationId && assessmentFilters.locationId !== 'all-locations') params.append('locationId', assessmentFilters.locationId);
      const response = await fetch(`/api/assessments/students?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch assessments');
      return response.json();
    },
    enabled: !!user?.email && activeTab === 'all',
  });
  
  const { data: schoolChildren = [] } = useQuery<Child[]>({
    queryKey: ['/api/admin/children'],
    enabled: !!user?.email && activeTab === 'all',
  });
  
  const { data: schoolLocations = [] } = useQuery<Location[]>({
    queryKey: ['/api/locations'],
    enabled: !!user?.email && activeTab === 'all',
  });

  const createTypeMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/assessments/types', data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create assessment type');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Assessment type created successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/assessments/types'] });
      setIsTypeDialogOpen(false);
      resetTypeForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateTypeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await apiRequest('PATCH', `/api/assessments/types/${id}`, data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update assessment type');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Assessment type updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/assessments/types'] });
      setIsTypeDialogOpen(false);
      setEditingType(null);
      resetTypeForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteTypeMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest('DELETE', `/api/assessments/types/${id}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete assessment type');
      }
      return true;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Assessment type deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/assessments/types'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createBookMutation = useMutation({
    mutationFn: async ({ typeId, data }: { typeId: number; data: any }) => {
      const response = await apiRequest('POST', `/api/assessments/types/${typeId}/books`, data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create curriculum book');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Curriculum book created successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/assessments/types'] });
      if (selectedTypeForBook) {
        queryClient.invalidateQueries({ queryKey: ['/api/assessments/types', selectedTypeForBook, 'books'] });
      }
      setIsBookDialogOpen(false);
      resetBookForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateBookMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await apiRequest('PATCH', `/api/assessments/books/${id}`, data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update curriculum book');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Curriculum book updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/assessments/types'] });
      setIsBookDialogOpen(false);
      setEditingBook(null);
      resetBookForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteBookMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest('DELETE', `/api/assessments/books/${id}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete curriculum book');
      }
      return true;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Curriculum book deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/assessments/types'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetTypeForm = () => {
    setTypeForm({
      name: '',
      description: '',
      category: 'reading',
      scoreFormat: 'numeric',
      minScore: '',
      maxScore: '',
      passingScore: '',
      isActive: true,
    });
  };

  const resetBookForm = () => {
    setBookForm({
      name: '',
      description: '',
      totalLessons: '',
      gradeLevel: '',
      isActive: true,
    });
  };

  const openEditTypeDialog = (type: AssessmentType) => {
    setEditingType(type);
    setTypeForm({
      name: type.name,
      description: type.description || '',
      category: type.category,
      scoreFormat: type.scoreFormat,
      minScore: type.minScore?.toString() || '',
      maxScore: type.maxScore?.toString() || '',
      passingScore: type.passingScore?.toString() || '',
      isActive: type.isActive,
    });
    setIsTypeDialogOpen(true);
  };

  const openEditBookDialog = (book: CurriculumBook) => {
    setEditingBook(book);
    setBookForm({
      name: book.name,
      description: book.description || '',
      totalLessons: book.totalLessons?.toString() || '',
      gradeLevel: book.gradeLevel || '',
      isActive: book.isActive,
    });
    setIsBookDialogOpen(true);
  };

  const openAddBookDialog = (typeId: number) => {
    setSelectedTypeForBook(typeId);
    resetBookForm();
    setIsBookDialogOpen(true);
  };

  const handleTypeSubmit = () => {
    const data = {
      name: typeForm.name,
      description: typeForm.description || null,
      category: typeForm.category,
      scoreFormat: typeForm.scoreFormat,
      minScore: typeForm.minScore ? parseFloat(typeForm.minScore) : null,
      maxScore: typeForm.maxScore ? parseFloat(typeForm.maxScore) : null,
      passingScore: typeForm.passingScore ? parseFloat(typeForm.passingScore) : null,
      isActive: typeForm.isActive,
    };

    if (editingType) {
      updateTypeMutation.mutate({ id: editingType.id, data });
    } else {
      createTypeMutation.mutate(data);
    }
  };

  const handleBookSubmit = () => {
    const data = {
      name: bookForm.name,
      description: bookForm.description || null,
      totalLessons: bookForm.totalLessons ? parseInt(bookForm.totalLessons) : null,
      gradeLevel: bookForm.gradeLevel || null,
      isActive: bookForm.isActive,
    };

    if (editingBook) {
      updateBookMutation.mutate({ id: editingBook.id, data });
    } else if (selectedTypeForBook) {
      createBookMutation.mutate({ typeId: selectedTypeForBook, data });
    }
  };

  const toggleTypeExpanded = (typeId: number) => {
    const newExpanded = new Set(expandedTypes);
    if (newExpanded.has(typeId)) {
      newExpanded.delete(typeId);
    } else {
      newExpanded.add(typeId);
    }
    setExpandedTypes(newExpanded);
  };

  const getCategoryLabel = (category: string) => {
    return categoryOptions.find(c => c.value === category)?.label || category;
  };

  const getScoreFormatLabel = (format: string) => {
    return scoreFormatOptions.find(f => f.value === format)?.label || format;
  };

  return (
    <AppShell>
      <div className="container mx-auto py-6 px-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="page-title">
              <GraduationCap className="h-6 w-6" />
              Assessment Management
            </h1>
            <p className="text-muted-foreground mt-1">
              Define assessment types and curriculum materials for student progress tracking
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="types" className="flex items-center gap-2" data-testid="tab-types">
              <ClipboardList className="h-4 w-4" />
              Assessment Types
            </TabsTrigger>
            <TabsTrigger value="all" className="flex items-center gap-2" data-testid="tab-all-assessments">
              <Users className="h-4 w-4" />
              All Assessments
            </TabsTrigger>
            <TabsTrigger value="overview" className="flex items-center gap-2" data-testid="tab-overview">
              <BookOpen className="h-4 w-4" />
              Overview
            </TabsTrigger>
          </TabsList>

          <TabsContent value="types">
            <div className="flex justify-end mb-4">
              <Button
                onClick={() => {
                  setEditingType(null);
                  resetTypeForm();
                  setIsTypeDialogOpen(true);
                }}
                data-testid="button-add-type"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Assessment Type
              </Button>
            </div>

            {typesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : assessmentTypes.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Assessment Types</h3>
                  <p className="text-muted-foreground mb-4">
                    Get started by creating your first assessment type for tracking student progress.
                  </p>
                  <Button onClick={() => setIsTypeDialogOpen(true)} data-testid="button-create-first-type">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Assessment Type
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {assessmentTypes.map((type) => (
                  <AssessmentTypeCard
                    key={type.id}
                    type={type}
                    isExpanded={expandedTypes.has(type.id)}
                    onToggleExpand={() => toggleTypeExpanded(type.id)}
                    onEdit={() => openEditTypeDialog(type)}
                    onDelete={() => deleteTypeMutation.mutate(type.id)}
                    onAddBook={() => openAddBookDialog(type.id)}
                    onEditBook={openEditBookDialog}
                    onDeleteBook={(bookId) => deleteBookMutation.mutate(bookId)}
                    getCategoryLabel={getCategoryLabel}
                    getScoreFormatLabel={getScoreFormatLabel}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="all">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  All Student Assessments
                </CardTitle>
                <CardDescription>View and filter all recorded assessments across students</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4 mb-6">
                  <div className="flex-1 min-w-[180px]">
                    <Label htmlFor="filter-location" className="text-sm">Class/Location</Label>
                    <Select
                      value={assessmentFilters.locationId}
                      onValueChange={(value) => setAssessmentFilters({ ...assessmentFilters, locationId: value })}
                    >
                      <SelectTrigger id="filter-location">
                        <SelectValue placeholder="All locations" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all-locations">All locations</SelectItem>
                        {schoolLocations.map((location) => (
                          <SelectItem key={location.id} value={String(location.id)}>
                            {location.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <Label htmlFor="filter-child" className="text-sm">Student</Label>
                    <Select
                      value={assessmentFilters.childId}
                      onValueChange={(value) => setAssessmentFilters({ ...assessmentFilters, childId: value })}
                    >
                      <SelectTrigger id="filter-child">
                        <SelectValue placeholder="All students" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all-students">All students</SelectItem>
                        {schoolChildren.map((child) => (
                          <SelectItem key={child.id} value={String(child.id)}>
                            {child.firstName} {child.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <Label htmlFor="filter-type" className="text-sm">Assessment Type</Label>
                    <Select
                      value={assessmentFilters.assessmentTypeId}
                      onValueChange={(value) => setAssessmentFilters({ ...assessmentFilters, assessmentTypeId: value })}
                    >
                      <SelectTrigger id="filter-type">
                        <SelectValue placeholder="All types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all-types">All types</SelectItem>
                        {assessmentTypes.map((type) => (
                          <SelectItem key={type.id} value={String(type.id)}>
                            {type.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      variant="outline"
                      onClick={() => setAssessmentFilters({ childId: 'all-students', assessmentTypeId: 'all-types', locationId: 'all-locations', searchQuery: '' })}
                    >
                      Clear Filters
                    </Button>
                  </div>
                </div>

                {assessmentsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : allStudentAssessments.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <GraduationCap className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No assessments found</p>
                    <p className="text-sm">Try adjusting your filters or record new assessments</p>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Student</TableHead>
                          <TableHead>Assessment Type</TableHead>
                          <TableHead>Book/Lesson</TableHead>
                          <TableHead>Score</TableHead>
                          <TableHead>Lexile</TableHead>
                          <TableHead>Source</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allStudentAssessments.map((assessment) => (
                          <TableRow key={assessment.id}>
                            <TableCell className="whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                {format(new Date(assessment.assessmentDate), 'MMM d, yyyy')}
                              </div>
                            </TableCell>
                            <TableCell>
                              {assessment.child 
                                ? `${assessment.child.firstName} ${assessment.child.lastName}`
                                : `Child #${assessment.childId}`}
                            </TableCell>
                            <TableCell>
                              {assessment.assessmentType?.name || `Type #${assessment.assessmentTypeId}`}
                            </TableCell>
                            <TableCell>
                              {assessment.curriculumBook?.name && (
                                <span className="text-sm">
                                  Book {assessment.curriculumBook.name}
                                  {assessment.lesson && `, Lesson ${assessment.lesson}`}
                                </span>
                              )}
                              {!assessment.curriculumBook?.name && assessment.lesson && (
                                <span className="text-sm">Lesson {assessment.lesson}</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="bg-blue-50 text-blue-700">
                                {assessment.score}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {assessment.lexileScore !== null ? (
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700">
                                  {assessment.lexileScore}L
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-xs">
                                {assessment.source === 'in_app' ? 'In-App' : 'Manual'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                
                <div className="mt-4 text-sm text-muted-foreground">
                  Showing {allStudentAssessments.length} assessment{allStudentAssessments.length !== 1 ? 's' : ''}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="overview">
            <Card>
              <CardHeader>
                <CardTitle>Assessment Overview</CardTitle>
                <CardDescription>Summary of all assessment types and curriculum materials</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold">{assessmentTypes.length}</div>
                      <div className="text-muted-foreground">Assessment Types</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold">
                        {assessmentTypes.filter(t => t.isActive).length}
                      </div>
                      <div className="text-muted-foreground">Active Types</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold">
                        {[...new Set(assessmentTypes.map(t => t.category))].length}
                      </div>
                      <div className="text-muted-foreground">Categories</div>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={isTypeDialogOpen} onOpenChange={setIsTypeDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingType ? 'Edit Assessment Type' : 'Create Assessment Type'}</DialogTitle>
              <DialogDescription>
                {editingType 
                  ? 'Update the assessment type details below' 
                  : 'Define a new type of assessment to track student progress'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={typeForm.name}
                  onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
                  placeholder="e.g., McCall-Crabbs Reading"
                  data-testid="input-type-name"
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={typeForm.description}
                  onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })}
                  placeholder="Describe this assessment type..."
                  data-testid="input-type-description"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={typeForm.category}
                    onValueChange={(value) => setTypeForm({ ...typeForm, category: value })}
                  >
                    <SelectTrigger data-testid="select-type-category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categoryOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="scoreFormat">Score Format</Label>
                  <Select
                    value={typeForm.scoreFormat}
                    onValueChange={(value) => setTypeForm({ ...typeForm, scoreFormat: value })}
                  >
                    <SelectTrigger data-testid="select-type-score-format">
                      <SelectValue placeholder="Select format" />
                    </SelectTrigger>
                    <SelectContent>
                      {scoreFormatOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="minScore">Min Score</Label>
                  <Input
                    id="minScore"
                    type="number"
                    value={typeForm.minScore}
                    onChange={(e) => setTypeForm({ ...typeForm, minScore: e.target.value })}
                    placeholder="0"
                    data-testid="input-type-min-score"
                  />
                </div>
                <div>
                  <Label htmlFor="maxScore">Max Score</Label>
                  <Input
                    id="maxScore"
                    type="number"
                    value={typeForm.maxScore}
                    onChange={(e) => setTypeForm({ ...typeForm, maxScore: e.target.value })}
                    placeholder="100"
                    data-testid="input-type-max-score"
                  />
                </div>
                <div>
                  <Label htmlFor="passingScore">Passing Score</Label>
                  <Input
                    id="passingScore"
                    type="number"
                    value={typeForm.passingScore}
                    onChange={(e) => setTypeForm({ ...typeForm, passingScore: e.target.value })}
                    placeholder="70"
                    data-testid="input-type-passing-score"
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="isActive"
                  checked={typeForm.isActive}
                  onCheckedChange={(checked) => setTypeForm({ ...typeForm, isActive: checked })}
                  data-testid="switch-type-active"
                />
                <Label htmlFor="isActive">Active</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsTypeDialogOpen(false)} data-testid="button-cancel-type">
                Cancel
              </Button>
              <Button
                onClick={handleTypeSubmit}
                disabled={!typeForm.name || createTypeMutation.isPending || updateTypeMutation.isPending}
                data-testid="button-save-type"
              >
                {(createTypeMutation.isPending || updateTypeMutation.isPending) && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {editingType ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isBookDialogOpen} onOpenChange={setIsBookDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingBook ? 'Edit Curriculum Book' : 'Add Curriculum Book'}</DialogTitle>
              <DialogDescription>
                {editingBook 
                  ? 'Update the curriculum book details below' 
                  : 'Add a book or curriculum material for this assessment type'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="bookName">Name *</Label>
                <Input
                  id="bookName"
                  value={bookForm.name}
                  onChange={(e) => setBookForm({ ...bookForm, name: e.target.value })}
                  placeholder="e.g., Book A - Basic Reading"
                  data-testid="input-book-name"
                />
              </div>
              <div>
                <Label htmlFor="bookDescription">Description</Label>
                <Textarea
                  id="bookDescription"
                  value={bookForm.description}
                  onChange={(e) => setBookForm({ ...bookForm, description: e.target.value })}
                  placeholder="Describe this curriculum book..."
                  data-testid="input-book-description"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="totalLessons">Total Lessons</Label>
                  <Input
                    id="totalLessons"
                    type="number"
                    value={bookForm.totalLessons}
                    onChange={(e) => setBookForm({ ...bookForm, totalLessons: e.target.value })}
                    placeholder="e.g., 50"
                    data-testid="input-book-lessons"
                  />
                </div>
                <div>
                  <Label htmlFor="gradeLevel">Grade Level</Label>
                  <Input
                    id="gradeLevel"
                    value={bookForm.gradeLevel}
                    onChange={(e) => setBookForm({ ...bookForm, gradeLevel: e.target.value })}
                    placeholder="e.g., 3-5"
                    data-testid="input-book-grade"
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="bookIsActive"
                  checked={bookForm.isActive}
                  onCheckedChange={(checked) => setBookForm({ ...bookForm, isActive: checked })}
                  data-testid="switch-book-active"
                />
                <Label htmlFor="bookIsActive">Active</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsBookDialogOpen(false)} data-testid="button-cancel-book">
                Cancel
              </Button>
              <Button
                onClick={handleBookSubmit}
                disabled={!bookForm.name || createBookMutation.isPending || updateBookMutation.isPending}
                data-testid="button-save-book"
              >
                {(createBookMutation.isPending || updateBookMutation.isPending) && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {editingBook ? 'Update' : 'Add'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}

interface AssessmentTypeCardProps {
  type: AssessmentType;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddBook: () => void;
  onEditBook: (book: CurriculumBook) => void;
  onDeleteBook: (bookId: number) => void;
  getCategoryLabel: (category: string) => string;
  getScoreFormatLabel: (format: string) => string;
}

function AssessmentTypeCard({
  type,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onAddBook,
  onEditBook,
  onDeleteBook,
  getCategoryLabel,
  getScoreFormatLabel,
}: AssessmentTypeCardProps) {
  const { data: books = [], isLoading: booksLoading } = useQuery<CurriculumBook[]>({
    queryKey: ['/api/assessments/types', type.id, 'books'],
    queryFn: async () => {
      const response = await fetch(`/api/assessments/types/${type.id}/books`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch books');
      return response.json();
    },
    enabled: isExpanded,
  });

  return (
    <Card data-testid={`card-assessment-type-${type.id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Collapsible open={isExpanded} onOpenChange={onToggleExpand}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" data-testid={`button-expand-type-${type.id}`}>
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
            </Collapsible>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                {type.name}
                {!type.isActive && <Badge variant="secondary">Inactive</Badge>}
              </CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline">{getCategoryLabel(type.category)}</Badge>
                <Badge variant="outline">{getScoreFormatLabel(type.scoreFormat)}</Badge>
                {type.passingScore && (
                  <Badge variant="outline">Pass: {type.passingScore}</Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onEdit} data-testid={`button-edit-type-${type.id}`}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={onDelete} data-testid={`button-delete-type-${type.id}`}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {type.description && (
          <CardDescription className="ml-10">{type.description}</CardDescription>
        )}
      </CardHeader>
      <Collapsible open={isExpanded}>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="ml-10 mt-4 border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  Curriculum Books
                </h4>
                <Button variant="outline" size="sm" onClick={onAddBook} data-testid={`button-add-book-${type.id}`}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Book
                </Button>
              </div>
              {booksLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : books.length === 0 ? (
                <p className="text-muted-foreground text-sm py-2">No curriculum books added yet.</p>
              ) : (
                <div className="space-y-2">
                  {books.map((book) => (
                    <div
                      key={book.id}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                      data-testid={`card-curriculum-book-${book.id}`}
                    >
                      <div>
                        <div className="font-medium text-sm flex items-center gap-2">
                          {book.name}
                          {!book.isActive && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          {book.totalLessons && <span>{book.totalLessons} lessons</span>}
                          {book.gradeLevel && <span>Grade {book.gradeLevel}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEditBook(book)}
                          data-testid={`button-edit-book-${book.id}`}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDeleteBook(book.id)}
                          data-testid={`button-delete-book-${book.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
