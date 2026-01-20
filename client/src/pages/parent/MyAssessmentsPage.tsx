import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { Loader2, BookOpen, TrendingUp, Calendar, User } from "lucide-react";
import ParentAppShell from "@/components/layout/ParentAppShell";
import { format } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface Assessment {
  id: number;
  childId: number;
  assessmentTypeId: number;
  assessmentTypeName: string;
  assessmentTypeCategory: string;
  curriculumBookId: number | null;
  curriculumBookName: string | null;
  assessmentDate: string;
  score: string;
  lexileScore: number | null;
  lesson: number | null;
  notes: string | null;
  source: string;
}

interface ChildWithAssessments {
  child: {
    id: number;
    firstName: string;
    lastName: string;
    gradeLevel: string | null;
  };
  assessments: Assessment[];
}

function parseGradeLevel(score: string): number | null {
  const parsed = parseFloat(score);
  if (!isNaN(parsed) && parsed >= 0 && parsed <= 20) {
    return parsed;
  }
  return null;
}

function formatLexile(score: number | null): string {
  if (score === null) return 'N/A';
  return `${score}L`;
}

function AssessmentProgressChart({ assessments }: { assessments: Assessment[] }) {
  const readingAssessments = assessments
    .filter(a => a.assessmentTypeCategory === 'reading' || a.lexileScore !== null)
    .sort((a, b) => new Date(a.assessmentDate).getTime() - new Date(b.assessmentDate).getTime());

  if (readingAssessments.length < 2) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        <p>At least 2 reading assessments needed to show progress chart</p>
      </div>
    );
  }

  const chartData = readingAssessments.map((assessment) => {
    const gradeLevel = parseGradeLevel(assessment.score);
    return {
      date: format(new Date(assessment.assessmentDate), 'MMM dd'),
      gradeLevel: gradeLevel,
      lexileScore: assessment.lexileScore,
      book: assessment.curriculumBookName || assessment.assessmentTypeName
    };
  });

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis 
          yAxisId="left" 
          domain={[0, 12]} 
          label={{ value: 'Grade Level', angle: -90, position: 'insideLeft' }} 
        />
        <YAxis 
          yAxisId="right" 
          orientation="right" 
          domain={[0, 1500]}
          label={{ value: 'Lexile', angle: 90, position: 'insideRight' }} 
        />
        <Tooltip 
          content={({ active, payload, label }) => {
            if (active && payload && payload.length) {
              const data = payload[0].payload;
              return (
                <div className="bg-white p-3 border rounded-lg shadow-lg">
                  <p className="font-medium">{label}</p>
                  <p className="text-sm text-muted-foreground">{data.book}</p>
                  {data.gradeLevel && (
                    <p className="text-sm">Grade Level: <span className="font-medium">{data.gradeLevel.toFixed(2)}</span></p>
                  )}
                  {data.lexileScore && (
                    <p className="text-sm">Lexile: <span className="font-medium">{data.lexileScore}L</span></p>
                  )}
                </div>
              );
            }
            return null;
          }}
        />
        <Legend />
        <Line 
          yAxisId="left"
          type="monotone" 
          dataKey="gradeLevel" 
          stroke="#3b82f6" 
          strokeWidth={2}
          name="Grade Level"
          dot={{ fill: '#3b82f6' }}
          connectNulls
        />
        <Line 
          yAxisId="right"
          type="monotone" 
          dataKey="lexileScore" 
          stroke="#10b981" 
          strokeWidth={2}
          name="Lexile Score"
          dot={{ fill: '#10b981' }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function AssessmentSummary({ assessments }: { assessments: Assessment[] }) {
  const readingAssessments = assessments.filter(a => 
    a.assessmentTypeCategory === 'reading' || a.lexileScore !== null
  );
  
  if (readingAssessments.length === 0) {
    return null;
  }
  
  const latestAssessment = readingAssessments.reduce((latest, current) => 
    new Date(current.assessmentDate) > new Date(latest.assessmentDate) ? current : latest
  );
  
  const oldestAssessment = readingAssessments.reduce((oldest, current) => 
    new Date(current.assessmentDate) < new Date(oldest.assessmentDate) ? current : oldest
  );
  
  const latestGrade = parseGradeLevel(latestAssessment.score);
  const oldestGrade = parseGradeLevel(oldestAssessment.score);
  
  const gradeGrowth = latestGrade && oldestGrade ? latestGrade - oldestGrade : null;
  const lexileGrowth = latestAssessment.lexileScore && oldestAssessment.lexileScore 
    ? latestAssessment.lexileScore - oldestAssessment.lexileScore 
    : null;
  
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <Card>
        <CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">Current Grade Level</p>
          <p className="text-2xl font-bold text-blue-600">
            {latestGrade ? latestGrade.toFixed(2) : 'N/A'}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">Current Lexile</p>
          <p className="text-2xl font-bold text-emerald-600">
            {formatLexile(latestAssessment.lexileScore)}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">Grade Growth</p>
          <p className={`text-2xl font-bold ${gradeGrowth && gradeGrowth > 0 ? 'text-green-600' : 'text-gray-500'}`}>
            {gradeGrowth !== null ? (gradeGrowth > 0 ? `+${gradeGrowth.toFixed(2)}` : gradeGrowth.toFixed(2)) : 'N/A'}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">Total Assessments</p>
          <p className="text-2xl font-bold">{assessments.length}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function ChildAssessmentTab({ data }: { data: ChildWithAssessments }) {
  const { child, assessments } = data;
  
  return (
    <div className="space-y-6">
      <AssessmentSummary assessments={assessments} />
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Reading Progress
          </CardTitle>
          <CardDescription>Grade level and Lexile score over time</CardDescription>
        </CardHeader>
        <CardContent>
          <AssessmentProgressChart assessments={assessments} />
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Assessment History
          </CardTitle>
          <CardDescription>All recorded assessments</CardDescription>
        </CardHeader>
        <CardContent>
          {assessments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No assessments recorded yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {assessments.map((assessment) => {
                const gradeLevel = parseGradeLevel(assessment.score);
                return (
                  <div key={assessment.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0">
                        <Calendar className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium">{assessment.assessmentTypeName}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{format(new Date(assessment.assessmentDate), 'MMM d, yyyy')}</span>
                          {assessment.curriculumBookName && (
                            <>
                              <span>•</span>
                              <span>Book {assessment.curriculumBookName}</span>
                            </>
                          )}
                          {assessment.lesson && (
                            <>
                              <span>•</span>
                              <span>Lesson {assessment.lesson}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {gradeLevel !== null && (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700">
                          Grade {gradeLevel.toFixed(2)}
                        </Badge>
                      )}
                      {assessment.lexileScore !== null && (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700">
                          {assessment.lexileScore}L
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function MyAssessmentsPage() {
  const { data, isLoading, error } = useQuery<ChildWithAssessments[]>({
    queryKey: ['/api/assessments/parent/my-children'],
  });
  
  if (isLoading) {
    return (
      <ParentAppShell>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </ParentAppShell>
    );
  }
  
  if (error) {
    return (
      <ParentAppShell>
        <div className="text-center py-12">
          <p className="text-red-500">Failed to load assessments. Please try again.</p>
        </div>
      </ParentAppShell>
    );
  }
  
  if (!data || data.length === 0) {
    return (
      <ParentAppShell>
        <div className="container mx-auto py-8">
          <h1 className="text-2xl font-bold mb-6">Reading Assessments</h1>
          <Card>
            <CardContent className="py-12 text-center">
              <User className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium">No children found</p>
              <p className="text-muted-foreground">Register your children to see their assessment progress.</p>
            </CardContent>
          </Card>
        </div>
      </ParentAppShell>
    );
  }
  
  return (
    <ParentAppShell>
      <div className="container mx-auto py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Reading Assessments</h1>
          <p className="text-muted-foreground">Track your children's reading progress over time</p>
        </div>
        
        {data.length === 1 ? (
          <ChildAssessmentTab data={data[0]} />
        ) : (
          <Tabs defaultValue={String(data[0].child.id)}>
            <TabsList className="mb-6">
              {data.map((item) => (
                <TabsTrigger key={item.child.id} value={String(item.child.id)}>
                  <User className="h-4 w-4 mr-2" />
                  {item.child.firstName}
                </TabsTrigger>
              ))}
            </TabsList>
            {data.map((item) => (
              <TabsContent key={item.child.id} value={String(item.child.id)}>
                <ChildAssessmentTab data={item} />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    </ParentAppShell>
  );
}
