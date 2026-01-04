import { useState, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Upload, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle,
  FileSpreadsheet,
  Sparkles,
  UserCheck,
  RefreshCw,
  ArrowRight,
  X
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ColumnMapping {
  studentName?: string;
  firstName?: string;
  lastName?: string;
  assessmentDate?: string;
  score?: string;
  scoreNumerator?: string;
  scoreDenominator?: string;
  bookTitle?: string;
  lessonNumber?: string;
  notes?: string;
}

interface ParsedAssessment {
  studentName: string;
  firstName?: string;
  lastName?: string;
  matchedChildId?: number;
  matchConfidence?: number;
  matchedChildName?: string;
  assessmentDate?: string;
  score?: string;
  scoreNumerator?: number;
  scoreDenominator?: number;
  bookTitle?: string;
  lessonNumber?: number;
  notes?: string;
  rowIndex: number;
  errors: string[];
  warnings: string[];
}

interface AssessmentType {
  id: number;
  name: string;
  category: string;
  scoreFormat: string;
}

interface CurriculumBook {
  id: number;
  assessmentTypeId: number;
  name: string;
}

interface AvailableStudent {
  id: number;
  name: string;
  gradeLevel: string;
}

type UploadStep = 'upload' | 'mapping' | 'matching' | 'review' | 'complete';

export default function AssessmentBulkUpload() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [step, setStep] = useState<UploadStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [sampleData, setSampleData] = useState<Record<string, string>[]>([]);
  const [allRecords, setAllRecords] = useState<Record<string, string>[]>([]);
  const [parsedAssessments, setParsedAssessments] = useState<ParsedAssessment[]>([]);
  const [availableStudents, setAvailableStudents] = useState<AvailableStudent[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  const [selectedBookId, setSelectedBookId] = useState<string>('');
  const [importResults, setImportResults] = useState<{successful: number; failed: number; errors: {row: number; error: string}[]}>({
    successful: 0,
    failed: 0,
    errors: [],
  });

  const { data: assessmentTypes = [] } = useQuery<AssessmentType[]>({
    queryKey: ['/api/assessments/types'],
  });

  const { data: curriculumBooks = [] } = useQuery<CurriculumBook[]>({
    queryKey: ['/api/assessments/types', selectedTypeId, 'books'],
    queryFn: async () => {
      if (!selectedTypeId) return [];
      const response = await fetch(`/api/assessments/types/${selectedTypeId}/books`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!selectedTypeId,
  });

  const previewMutation = useMutation({
    mutationFn: async (uploadedFile: File) => {
      const formData = new FormData();
      formData.append('file', uploadedFile);
      
      const response = await fetch('/api/assessment-upload/preview', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to preview file');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      setColumns(data.columns);
      setMapping(data.suggestedMapping);
      setSampleData(data.sampleData);
      setAllRecords(data.allRecords || data.sampleData);
      setStep('mapping');
      
      if (data.aiSuggestions?.length > 0) {
        toast({
          title: 'AI Analysis Complete',
          description: 'Column mappings have been suggested based on your data.',
        });
      }
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Upload Failed',
        description: error.message,
      });
    },
  });

  const matchMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/assessment-upload/match-students', {
        records: allRecords,
        mapping,
      });
      return response.json();
    },
    onSuccess: (data: { assessments: ParsedAssessment[]; availableStudents: AvailableStudent[] }) => {
      setParsedAssessments(data.assessments);
      setAvailableStudents(data.availableStudents);
      setStep('matching');
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Matching Failed',
        description: error.message,
      });
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/assessment-upload/import', {
        assessments: parsedAssessments.filter(a => a.matchedChildId),
        assessmentTypeId: parseInt(selectedTypeId),
        curriculumBookId: selectedBookId ? parseInt(selectedBookId) : undefined,
      });
      return response.json();
    },
    onSuccess: (data: { successful: number; failed: number; errors: { row: number; error: string }[] }) => {
      setImportResults(data);
      setStep('complete');
      queryClient.invalidateQueries({ queryKey: ['/api/assessments/students'] });
      
      toast({
        title: 'Import Complete',
        description: `Successfully imported ${data.successful} assessments.`,
      });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Import Failed',
        description: error.message,
      });
    },
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const uploadedFile = acceptedFiles[0];
      setFile(uploadedFile);
      previewMutation.mutate(uploadedFile);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
  });

  const updateMapping = (field: keyof ColumnMapping, value: string) => {
    setMapping(prev => ({
      ...prev,
      [field]: value === '__none__' ? undefined : value,
    }));
  };

  const updateStudentMatch = (rowIndex: number, childId: number) => {
    setParsedAssessments(prev => prev.map(a => {
      if (a.rowIndex === rowIndex) {
        const student = availableStudents.find(s => s.id === childId);
        return {
          ...a,
          matchedChildId: childId,
          matchedChildName: student?.name,
          matchConfidence: 1.0,
          warnings: a.warnings.filter(w => !w.includes('No matching student')),
        };
      }
      return a;
    }));
  };

  const resetUpload = () => {
    setStep('upload');
    setFile(null);
    setColumns([]);
    setMapping({});
    setSampleData([]);
    setAllRecords([]);
    setParsedAssessments([]);
    setSelectedTypeId('');
    setSelectedBookId('');
    setImportResults({ successful: 0, failed: 0, errors: [] });
  };

  const matchedCount = parsedAssessments.filter(a => a.matchedChildId).length;
  const unmatchedCount = parsedAssessments.filter(a => !a.matchedChildId && a.errors.length === 0).length;
  const errorCount = parsedAssessments.filter(a => a.errors.length > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Bulk Assessment Upload</h2>
          <p className="text-sm text-muted-foreground">
            Upload a CSV file to import multiple student assessments at once
          </p>
        </div>
        {step !== 'upload' && (
          <Button variant="outline" onClick={resetUpload} data-testid="button-reset-upload">
            <X className="h-4 w-4 mr-2" />
            Start Over
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 mb-6">
        {['upload', 'mapping', 'matching', 'review', 'complete'].map((s, i) => (
          <div key={s} className="flex items-center">
            <div 
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === s 
                  ? 'bg-primary text-primary-foreground' 
                  : ['upload', 'mapping', 'matching', 'review', 'complete'].indexOf(step) > i
                    ? 'bg-green-500 text-white'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {['upload', 'mapping', 'matching', 'review', 'complete'].indexOf(step) > i ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                i + 1
              )}
            </div>
            {i < 4 && <div className="w-8 h-0.5 bg-muted mx-1" />}
          </div>
        ))}
      </div>

      {step === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Upload CSV File
            </CardTitle>
            <CardDescription>
              Drag and drop a CSV file or click to browse. Our AI will analyze the columns automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
              data-testid="dropzone-csv"
            >
              <input {...getInputProps()} data-testid="input-file" />
              {previewMutation.isPending ? (
                <div className="flex flex-col items-center gap-4">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  <div>
                    <p className="font-medium">Analyzing your file...</p>
                    <p className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                      <Sparkles className="h-4 w-4" />
                      AI is detecting column mappings
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <Upload className="h-12 w-12 text-muted-foreground" />
                  <div>
                    <p className="font-medium">
                      {isDragActive ? 'Drop your file here' : 'Drag & drop your CSV file here'}
                    </p>
                    <p className="text-sm text-muted-foreground">or click to browse</p>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 text-sm text-muted-foreground">
              <p className="font-medium mb-2">Expected columns:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Student Name (or First Name + Last Name)</li>
                <li>Score (numeric, fraction like 8/10, or letter grade)</li>
                <li>Assessment Date (optional)</li>
                <li>Lesson Number (optional)</li>
                <li>Notes (optional)</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'mapping' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              Column Mapping
            </CardTitle>
            <CardDescription>
              Review and adjust the AI-suggested column mappings. We'll use these to parse your data.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Student Name Column</Label>
                <Select 
                  value={mapping.studentName || '__none__'} 
                  onValueChange={(v) => updateMapping('studentName', v)}
                >
                  <SelectTrigger data-testid="select-student-name">
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">-- Not mapped --</SelectItem>
                    {columns.map(col => (
                      <SelectItem key={col} value={col}>{col}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Score Column</Label>
                <Select 
                  value={mapping.score || '__none__'} 
                  onValueChange={(v) => updateMapping('score', v)}
                >
                  <SelectTrigger data-testid="select-score">
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">-- Not mapped --</SelectItem>
                    {columns.map(col => (
                      <SelectItem key={col} value={col}>{col}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Date Column (optional)</Label>
                <Select 
                  value={mapping.assessmentDate || '__none__'} 
                  onValueChange={(v) => updateMapping('assessmentDate', v)}
                >
                  <SelectTrigger data-testid="select-date">
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">-- Not mapped --</SelectItem>
                    {columns.map(col => (
                      <SelectItem key={col} value={col}>{col}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Lesson Number (optional)</Label>
                <Select 
                  value={mapping.lessonNumber || '__none__'} 
                  onValueChange={(v) => updateMapping('lessonNumber', v)}
                >
                  <SelectTrigger data-testid="select-lesson">
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">-- Not mapped --</SelectItem>
                    {columns.map(col => (
                      <SelectItem key={col} value={col}>{col}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Notes Column (optional)</Label>
                <Select 
                  value={mapping.notes || '__none__'} 
                  onValueChange={(v) => updateMapping('notes', v)}
                >
                  <SelectTrigger data-testid="select-notes">
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">-- Not mapped --</SelectItem>
                    {columns.map(col => (
                      <SelectItem key={col} value={col}>{col}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {sampleData.length > 0 && (
              <div className="mt-6">
                <Label className="mb-2 block">Sample Data Preview</Label>
                <ScrollArea className="h-48 border rounded-md">
                  <table className="w-full text-sm">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        {columns.slice(0, 6).map(col => (
                          <th key={col} className="px-3 py-2 text-left font-medium">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sampleData.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-t">
                          {columns.slice(0, 6).map(col => (
                            <td key={col} className="px-3 py-2 truncate max-w-32">{row[col]}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={resetUpload}>Cancel</Button>
              <Button 
                onClick={() => matchMutation.mutate()}
                disabled={!mapping.studentName || matchMutation.isPending}
                data-testid="button-continue-matching"
              >
                {matchMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Matching Students...
                  </>
                ) : (
                  <>
                    Continue to Student Matching
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'matching' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5" />
                Student Matching
              </CardTitle>
              <CardDescription>
                Review matched students and manually assign any unmatched records.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
                  <div className="text-2xl font-bold text-green-600">{matchedCount}</div>
                  <div className="text-sm text-green-600">Matched</div>
                </div>
                <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
                  <div className="text-2xl font-bold text-amber-600">{unmatchedCount}</div>
                  <div className="text-sm text-amber-600">Need Review</div>
                </div>
                <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
                  <div className="text-2xl font-bold text-red-600">{errorCount}</div>
                  <div className="text-sm text-red-600">Errors</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="space-y-2">
                  <Label>Assessment Type *</Label>
                  <Select value={selectedTypeId} onValueChange={setSelectedTypeId}>
                    <SelectTrigger data-testid="select-assessment-type">
                      <SelectValue placeholder="Select assessment type" />
                    </SelectTrigger>
                    <SelectContent>
                      {assessmentTypes.map(type => (
                        <SelectItem key={type.id} value={type.id.toString()}>{type.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {curriculumBooks.length > 0 && (
                  <div className="space-y-2">
                    <Label>Curriculum Book (optional)</Label>
                    <Select value={selectedBookId} onValueChange={setSelectedBookId}>
                      <SelectTrigger data-testid="select-curriculum-book">
                        <SelectValue placeholder="Select book" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">-- None --</SelectItem>
                        {curriculumBooks.map(book => (
                          <SelectItem key={book.id} value={book.id.toString()}>{book.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <ScrollArea className="h-96">
                <div className="space-y-2">
                  {parsedAssessments.map((assessment, idx) => (
                    <div 
                      key={idx} 
                      className={`p-3 rounded-lg border ${
                        assessment.errors.length > 0 
                          ? 'border-red-200 bg-red-50 dark:bg-red-950/50' 
                          : assessment.matchedChildId 
                            ? 'border-green-200 bg-green-50 dark:bg-green-950/50' 
                            : 'border-amber-200 bg-amber-50 dark:bg-amber-950/50'
                      }`}
                      data-testid={`row-assessment-${idx}`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Row {assessment.rowIndex}:</span>
                            <span className="truncate">{assessment.studentName}</span>
                            {assessment.score && (
                              <Badge variant="secondary">{assessment.score}</Badge>
                            )}
                          </div>
                          {assessment.matchedChildId ? (
                            <div className="text-sm text-green-600 flex items-center gap-1 mt-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Matched: {assessment.matchedChildName}
                              {assessment.matchConfidence && assessment.matchConfidence < 1 && (
                                <span className="text-muted-foreground">
                                  ({Math.round(assessment.matchConfidence * 100)}% confidence)
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="text-sm text-amber-600 flex items-center gap-1 mt-1">
                              <AlertTriangle className="h-3 w-3" />
                              {assessment.errors.length > 0 ? assessment.errors.join(', ') : 'No match found'}
                            </div>
                          )}
                        </div>
                        
                        {!assessment.matchedChildId && assessment.errors.length === 0 && (
                          <Select 
                            value="" 
                            onValueChange={(v) => updateStudentMatch(assessment.rowIndex, parseInt(v))}
                          >
                            <SelectTrigger className="w-48" data-testid={`select-student-${idx}`}>
                              <SelectValue placeholder="Assign student" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableStudents.map(student => (
                                <SelectItem key={student.id} value={student.id.toString()}>
                                  {student.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="flex justify-end gap-2 pt-4 border-t mt-4">
                <Button variant="outline" onClick={() => setStep('mapping')}>Back</Button>
                <Button 
                  onClick={() => importMutation.mutate()}
                  disabled={matchedCount === 0 || !selectedTypeId || importMutation.isPending}
                  data-testid="button-import"
                >
                  {importMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      Import {matchedCount} Assessments
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {step === 'complete' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              Import Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
                <div className="text-3xl font-bold text-green-600">{importResults.successful}</div>
                <div className="text-sm text-green-600">Successfully Imported</div>
              </div>
              <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
                <div className="text-3xl font-bold text-red-600">{importResults.failed}</div>
                <div className="text-sm text-red-600">Failed</div>
              </div>
            </div>

            {importResults.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Import Errors</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc list-inside mt-2">
                    {importResults.errors.slice(0, 5).map((err, i) => (
                      <li key={i}>Row {err.row}: {err.error}</li>
                    ))}
                    {importResults.errors.length > 5 && (
                      <li>...and {importResults.errors.length - 5} more errors</li>
                    )}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={resetUpload} data-testid="button-upload-another">
                <RefreshCw className="h-4 w-4 mr-2" />
                Upload Another File
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
