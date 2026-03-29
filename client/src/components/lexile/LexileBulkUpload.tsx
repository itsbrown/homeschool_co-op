import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  FileSpreadsheet,
  UserCheck,
  X,
  ChevronDown,
  ArrowRight,
} from 'lucide-react';
import StudentSearchSelect from './StudentSearchSelect';

type WizardStep = 'upload' | 'preview' | 'match' | 'import' | 'summary';

interface MatchedRow {
  rowIndex: number;
  rawName: string;
  matchedChildId: number | null;
  matchedChildName: string | null;
  confidence: number;
  candidates: Array<{ id: number; name: string; gradeLevel: string }>;
  row: Record<string, string>;
}

interface ImportResult {
  updated: number;
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
}

interface ColumnMapping {
  lexileRange?: string;
  readingGradeLevel?: string;
  bookList?: string;
  notes?: string;
}

export default function LexileBulkUpload() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<WizardStep>('upload');
  const [columns, setColumns] = useState<string[]>([]);
  const [allRecords, setAllRecords] = useState<Record<string, string>[]>([]);
  const [sampleData, setSampleData] = useState<Record<string, string>[]>([]);
  const [studentNameColumn, setStudentNameColumn] = useState<string>('');
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [matchedRows, setMatchedRows] = useState<MatchedRow[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [errorsOpen, setErrorsOpen] = useState(false);

  const resetAll = () => {
    setStep('upload');
    setColumns([]);
    setAllRecords([]);
    setSampleData([]);
    setStudentNameColumn('');
    setColumnMapping({});
    setMatchedRows([]);
    setImportResult(null);
    setErrorsOpen(false);
  };

  const previewMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await apiRequest('POST', '/api/lexile/upload/preview', formData);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to parse CSV');
      }
      return response.json();
    },
    onSuccess: (data) => {
      setColumns(data.columns || []);
      setSampleData(data.sampleData || []);
      setAllRecords(data.allRecords || []);
      setStep('preview');
      toast({ title: 'File uploaded', description: `${data.totalRows} rows found.` });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Upload Failed', description: error.message });
    },
  });

  const matchMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/lexile/upload/match', {
        rows: allRecords,
        studentNameColumn,
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to match students');
      }
      return response.json();
    },
    onSuccess: (data) => {
      setMatchedRows(data.matchedRows || []);
      setStep('match');
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Matching Failed', description: error.message });
    },
  });

  const [importProgress, setImportProgress] = useState({ processed: 0, total: 0 });

  const importMutation = useMutation({
    mutationFn: async () => {
      const rowsToProcess = matchedRows.filter(r => r.matchedChildId);
      const total = rowsToProcess.length;
      setImportProgress({ processed: 0, total });

      const BATCH_SIZE = 5;
      let totalUpdated = 0;
      let totalSkipped = matchedRows.filter(r => !r.matchedChildId).length;
      const allErrors: { row: number; reason: string }[] = [];

      for (let i = 0; i < rowsToProcess.length; i += BATCH_SIZE) {
        const batch = rowsToProcess.slice(i, i + BATCH_SIZE);
        const response = await apiRequest('POST', '/api/lexile/upload/import', {
          confirmedRows: batch,
          columnMapping,
        });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.message || 'Failed to import');
        }
        const result: ImportResult = await response.json();
        totalUpdated += result.updated;
        totalSkipped += result.skipped;
        allErrors.push(...result.errors);
        setImportProgress({ processed: Math.min(i + BATCH_SIZE, rowsToProcess.length), total });
      }

      return { updated: totalUpdated, skipped: totalSkipped, errors: allErrors };
    },
    onSuccess: (data: ImportResult) => {
      setImportResult(data);
      setStep('summary');
      queryClient.invalidateQueries({ queryKey: ['/api/lexile/students'] });
      toast({
        title: 'Import Complete',
        description: `Updated ${data.updated} students, skipped ${data.skipped}.`,
      });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Import Failed', description: error.message });
      setStep('match');
    },
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      previewMutation.mutate(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    maxFiles: 1,
  });

  const updateRowMatch = (rowIndex: number, childId: number | null, childName?: string) => {
    setMatchedRows(prev => prev.map(r => r.rowIndex === rowIndex ? {
      ...r,
      matchedChildId: childId,
      matchedChildName: childName || null,
      confidence: childId ? 1.0 : 0,
    } : r));
  };

  const steps: WizardStep[] = ['upload', 'preview', 'match', 'import', 'summary'];
  const stepLabels = ['Upload', 'Preview', 'Match', 'Import', 'Summary'];

  const matchedCount = matchedRows.filter(r => r.matchedChildId).length;
  const unmatchedCount = matchedRows.filter(r => !r.matchedChildId).length;
  const progressPct = matchedRows.length > 0 ? Math.round((matchedCount / matchedRows.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Bulk CSV Upload</h2>
          <p className="text-sm text-muted-foreground">Upload a CSV file to import Lexile data for multiple students</p>
        </div>
        {step !== 'upload' && (
          <Button variant="outline" onClick={resetAll}>
            <X className="h-4 w-4 mr-2" /> Start Over
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step === s ? 'bg-emerald-600 text-white' :
              steps.indexOf(step) > i ? 'bg-green-500 text-white' :
              'bg-muted text-muted-foreground'
            }`}>
              {steps.indexOf(step) > i ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </div>
            {i < steps.length - 1 && <div className="w-8 h-0.5 bg-muted mx-1" />}
          </div>
        ))}
        <span className="ml-2 text-sm text-muted-foreground capitalize">{step}</span>
      </div>

      {step === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Upload CSV File
            </CardTitle>
            <CardDescription>Upload a CSV file with student reading level data</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                isDragActive ? 'border-emerald-500 bg-emerald-50' : 'border-muted-foreground/25 hover:border-emerald-400'
              }`}
            >
              <input {...getInputProps()} />
              {previewMutation.isPending ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-12 w-12 animate-spin text-emerald-600" />
                  <p className="font-medium">Parsing your file...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <Upload className="h-12 w-12 text-muted-foreground" />
                  <p className="font-medium">{isDragActive ? 'Drop your file here' : 'Drag & drop a CSV file here'}</p>
                  <p className="text-sm text-muted-foreground">or click to browse</p>
                </div>
              )}
            </div>
            <div className="mt-4 text-sm text-muted-foreground">
              <p className="font-medium mb-1">Expected columns (in any order):</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Student Name (required)</li>
                <li>Lexile Range (e.g., 420L–650L)</li>
                <li>Reading Grade Level</li>
                <li>Book List</li>
                <li>Notes (optional)</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'preview' && (
        <Card>
          <CardHeader>
            <CardTitle>Preview & Column Mapping</CardTitle>
            <CardDescription>Map the CSV columns to Lexile data fields</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Student Name Column *</Label>
                <Select value={studentNameColumn} onValueChange={setStudentNameColumn}>
                  <SelectTrigger style={{ fontSize: '16px' }}>
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent>
                    {columns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Lexile Range Column</Label>
                <Select value={columnMapping.lexileRange || '__none__'} onValueChange={v => setColumnMapping(prev => ({ ...prev, lexileRange: v === '__none__' ? undefined : v }))}>
                  <SelectTrigger style={{ fontSize: '16px' }}>
                    <SelectValue placeholder="Select column (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">-- Not mapped --</SelectItem>
                    {columns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Reading Grade Level Column</Label>
                <Select value={columnMapping.readingGradeLevel || '__none__'} onValueChange={v => setColumnMapping(prev => ({ ...prev, readingGradeLevel: v === '__none__' ? undefined : v }))}>
                  <SelectTrigger style={{ fontSize: '16px' }}>
                    <SelectValue placeholder="Select column (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">-- Not mapped --</SelectItem>
                    {columns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Book List Column</Label>
                <Select value={columnMapping.bookList || '__none__'} onValueChange={v => setColumnMapping(prev => ({ ...prev, bookList: v === '__none__' ? undefined : v }))}>
                  <SelectTrigger style={{ fontSize: '16px' }}>
                    <SelectValue placeholder="Select column (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">-- Not mapped --</SelectItem>
                    {columns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {sampleData.length > 0 && (
              <div>
                <Label className="mb-2 block">Data Preview (first 5 rows)</Label>
                <ScrollArea className="h-48 border rounded-md">
                  <table className="w-full text-sm">
                    <thead className="bg-muted sticky top-0">
                      <tr>{columns.slice(0, 6).map(c => <th key={c} className="px-3 py-2 text-left font-medium">{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {sampleData.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-t">
                          {columns.slice(0, 6).map(c => <td key={c} className="px-3 py-2 truncate max-w-32">{row[c]}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={resetAll}>Cancel</Button>
              <Button
                onClick={() => matchMutation.mutate()}
                disabled={!studentNameColumn || matchMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {matchMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Matching...</> : <><ArrowRight className="h-4 w-4 mr-2" /> Match Students</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'match' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5" />
              Review Student Matches
            </CardTitle>
            <CardDescription>Verify or manually assign student matches</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4 text-sm">
              <Badge variant="default" className="bg-green-500">{matchedCount} matched</Badge>
              {unmatchedCount > 0 && <Badge variant="destructive">{unmatchedCount} unmatched</Badge>}
            </div>
            <Progress value={progressPct} className="h-2" />

            <ScrollArea className="h-80 border rounded-md p-2">
              <div className="space-y-3">
                {matchedRows.map(row => (
                  <div key={row.rowIndex} className={`flex items-center gap-3 p-3 rounded-lg border ${row.matchedChildId ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{row.rawName}</p>
                      {row.matchedChildName && (
                        <p className="text-xs text-muted-foreground">Matched: {row.matchedChildName}</p>
                      )}
                    </div>
                    {!row.matchedChildId && (
                      <div className="w-64 shrink-0">
                        <StudentSearchSelect
                          onSelect={(id, student) => updateRowMatch(row.rowIndex, id, student ? `${student.firstName} ${student.lastName}` : undefined)}
                          placeholder="Assign student"
                        />
                      </div>
                    )}
                    {row.matchedChildId ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep('preview')}>Back</Button>
              <Button
                onClick={() => {
                  setStep('import');
                  importMutation.mutate();
                }}
                disabled={matchedCount === 0 || importMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {importMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importing...</> : <><ArrowRight className="h-4 w-4 mr-2" /> Import {matchedCount} Students</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'import' && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-12 w-12 animate-spin text-emerald-600" />
              <p className="text-lg font-medium">Importing data...</p>
              <p className="text-sm text-muted-foreground">
                {importProgress.total > 0
                  ? `Processing ${importProgress.processed} of ${importProgress.total} students`
                  : `Processing ${matchedCount} student records`}
              </p>
              <Progress
                value={importProgress.total > 0 ? Math.round((importProgress.processed / importProgress.total) * 100) : 5}
                className="w-64 h-2"
              />
              {importProgress.total > 0 && (
                <p className="text-xs text-muted-foreground">
                  {Math.round((importProgress.processed / importProgress.total) * 100)}% complete
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'summary' && importResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Import Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <p className="text-2xl font-bold text-green-700">{importResult.updated}</p>
                <p className="text-sm text-green-600">Updated</p>
              </div>
              <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <p className="text-2xl font-bold text-yellow-700">{importResult.skipped}</p>
                <p className="text-sm text-yellow-600">Skipped</p>
              </div>
              <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                <p className="text-2xl font-bold text-red-700">{importResult.errors.length}</p>
                <p className="text-sm text-red-600">Errors</p>
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <Collapsible open={errorsOpen} onOpenChange={setErrorsOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full">
                    <AlertCircle className="h-4 w-4 mr-2 text-red-500" />
                    View {importResult.errors.length} errors
                    <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${errorsOpen ? 'rotate-180' : ''}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ScrollArea className="h-48 border rounded-md mt-2 p-2">
                    {importResult.errors.map((e, i) => (
                      <div key={i} className="flex gap-2 text-sm py-1 border-b last:border-0">
                        <span className="text-muted-foreground shrink-0">Row {e.row}:</span>
                        <span className="text-red-600">{e.reason}</span>
                      </div>
                    ))}
                  </ScrollArea>
                </CollapsibleContent>
              </Collapsible>
            )}

            <Button onClick={resetAll} className="w-full">Upload Another File</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
