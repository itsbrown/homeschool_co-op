import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookOpen, Upload, Brain, Users } from 'lucide-react';
import LexileManualEntryForm from './LexileManualEntryForm';
import LexileBulkUpload from './LexileBulkUpload';
import LexileAIInsightCard from './LexileAIInsightCard';
import LexileGroupSummary from './LexileGroupSummary';
import StudentSearchSelect from './StudentSearchSelect';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

export default function LexileTab() {
  const [aiStudentId, setAiStudentId] = useState<number | null>(null);
  const [activeSubTab, setActiveSubTab] = useState('manual');

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Lexile Reading Levels</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Record, manage, and analyze student reading level data
        </p>
      </div>

      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="manual" className="flex items-center gap-2" data-testid="lexile-tab-manual">
            <BookOpen className="h-4 w-4" />
            Manual Entry
          </TabsTrigger>
          <TabsTrigger value="bulk" className="flex items-center gap-2" data-testid="lexile-tab-bulk">
            <Upload className="h-4 w-4" />
            Bulk Upload
          </TabsTrigger>
          <TabsTrigger value="ai-student" className="flex items-center gap-2" data-testid="lexile-tab-ai-student">
            <Brain className="h-4 w-4" />
            Student Insights
          </TabsTrigger>
          <TabsTrigger value="ai-group" className="flex items-center gap-2" data-testid="lexile-tab-ai-group">
            <Users className="h-4 w-4" />
            Group Summary
          </TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="mt-4">
          <LexileManualEntryForm />
        </TabsContent>

        <TabsContent value="bulk" className="mt-4">
          <LexileBulkUpload />
        </TabsContent>

        <TabsContent value="ai-student" className="mt-4">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-purple-600" />
                  Student Reading Insights
                </CardTitle>
                <CardDescription>
                  Select a student to generate AI-powered reading level analysis and book recommendations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-w-sm">
                  <Label className="mb-2 block">Select Student</Label>
                  <StudentSearchSelect
                    value={aiStudentId ? String(aiStudentId) : undefined}
                    onSelect={(id) => setAiStudentId(id)}
                    placeholder="Choose a student..."
                  />
                </div>
              </CardContent>
            </Card>

            {aiStudentId && (
              <LexileAIInsightCard childId={aiStudentId} />
            )}
          </div>
        </TabsContent>

        <TabsContent value="ai-group" className="mt-4">
          <LexileGroupSummary />
        </TabsContent>
      </Tabs>
    </div>
  );
}
