import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, BookOpen, Save, RotateCcw, BookMarked, TrendingUp, Info } from 'lucide-react';
import StudentSearchSelect from './StudentSearchSelect';

interface Student {
  id: number;
  firstName: string;
  lastName: string;
  gradeLevel: string;
  currentLexileRange?: string | null;
  currentReadingGradeLevel?: string | null;
  currentBookList?: string | null;
}

const formSchema = z.object({
  childId: z.number({ required_error: 'Please select a student' }).int().positive('Please select a student'),
  readingGradeLevel: z.string().optional(),
  lexileRange: z.string().optional(),
  bookList: z.string().optional(),
  notes: z.string().optional(),
}).refine(data => data.readingGradeLevel || data.lexileRange, {
  message: 'At least one of Reading Grade Level or Lexile Range is required',
  path: ['lexileRange'],
});

type FormValues = z.infer<typeof formSchema>;

export default function LexileManualEntryForm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      childId: undefined,
      readingGradeLevel: '',
      lexileRange: '',
      bookList: '',
      notes: '',
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const response = await apiRequest('POST', '/api/lexile/entry', data);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to save lexile entry');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Saved', description: 'Lexile reading data recorded successfully.' });
      queryClient.invalidateQueries({ queryKey: ['/api/lexile/students'] });
      const childId = form.getValues('childId');
      if (childId) {
        queryClient.invalidateQueries({ queryKey: ['/api/lexile/insights/student', childId] });
      }
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });

  const onSubmit = (data: FormValues) => {
    mutation.mutate(data);
  };

  const handleSaveAndAddAnother = () => {
    form.handleSubmit((data) => {
      mutation.mutate(data, {
        onSuccess: () => {
          toast({ title: 'Saved', description: 'Lexile reading data recorded. Ready for next entry.' });
          queryClient.invalidateQueries({ queryKey: ['/api/lexile/students'] });
          const childId = form.getValues('childId');
          if (childId) {
            queryClient.invalidateQueries({ queryKey: ['/api/lexile/insights/student', childId] });
          }
          form.reset();
          setSelectedStudent(null);
        },
        onError: (error: Error) => {
          toast({ variant: 'destructive', title: 'Error', description: error.message });
        },
      });
    })();
  };

  const handleStudentSelect = (id: number | null, student?: Student) => {
    form.setValue('childId', id as number);
    setSelectedStudent(student || null);
    // Pre-fill with current values for reference
    if (student) {
      if (student.currentLexileRange) form.setValue('lexileRange', student.currentLexileRange);
      if (student.currentReadingGradeLevel) form.setValue('readingGradeLevel', student.currentReadingGradeLevel);
      if (student.currentBookList) form.setValue('bookList', student.currentBookList);
    }
  };

  const hasCurrentData = selectedStudent && (
    selectedStudent.currentLexileRange ||
    selectedStudent.currentReadingGradeLevel ||
    selectedStudent.currentBookList
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-emerald-600" />
          Manual Lexile Entry
        </CardTitle>
        <CardDescription>
          Record reading level data for a single student. Current data is pre-filled for reference.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="childId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Student *</FormLabel>
                  <FormControl>
                    <StudentSearchSelect
                      value={field.value ? String(field.value) : undefined}
                      onSelect={handleStudentSelect}
                      disabled={mutation.isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {hasCurrentData && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 text-blue-700 font-medium text-xs uppercase tracking-wide">
                  <Info className="h-3.5 w-3.5" />
                  Current Profile for {selectedStudent?.firstName} {selectedStudent?.lastName}
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedStudent?.currentLexileRange && (
                    <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-xs">
                      <TrendingUp className="h-3 w-3 mr-1" />
                      Lexile: {selectedStudent.currentLexileRange}
                    </Badge>
                  )}
                  {selectedStudent?.currentReadingGradeLevel && (
                    <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs">
                      Grade Level: {selectedStudent.currentReadingGradeLevel}
                    </Badge>
                  )}
                </div>
                {selectedStudent?.currentBookList && (
                  <p className="text-xs text-blue-600 leading-relaxed">
                    <BookMarked className="h-3 w-3 inline mr-1" />
                    {selectedStudent.currentBookList.slice(0, 120)}{selectedStudent.currentBookList.length > 120 ? '...' : ''}
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="readingGradeLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reading Grade Level</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="e.g., 4.5 or 4th Grade"
                        style={{ fontSize: '16px' }}
                        disabled={mutation.isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lexileRange"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lexile Range</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="e.g., 420L–650L"
                        style={{ fontSize: '16px' }}
                        disabled={mutation.isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="bookList"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Book List</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="List books the student is currently reading or recommended books..."
                      rows={3}
                      disabled={mutation.isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Any additional notes about this assessment..."
                      rows={2}
                      disabled={mutation.isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={mutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">
                {mutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
                ) : (
                  <><Save className="h-4 w-4 mr-2" /> Save</>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={mutation.isPending}
                onClick={handleSaveAndAddAnother}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Save & Add Another
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
