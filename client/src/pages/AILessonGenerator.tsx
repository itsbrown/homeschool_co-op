import { useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

type GenerationType = 'curriculum' | 'lesson';

export default function AILessonGenerator() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [generationType, setGenerationType] = useState<GenerationType>('curriculum');
  const [subject, setSubject] = useState('Mathematics');
  const [gradeLevel, setGradeLevel] = useState('Grade 5');
  const [prompt, setPrompt] = useState('Create a comprehensive curriculum for teaching fractions');
  const [duration, setDuration] = useState(60);
  const [objectives, setObjectives] = useState('Understand and apply fraction addition with unlike denominators');
  const [learningStyles, setLearningStyles] = useState<string[]>(['visual', 'auditory', 'kinesthetic']);
  const { toast } = useToast();

  const handleLearningStyleToggle = (style: string) => {
    if (learningStyles.includes(style)) {
      setLearningStyles(learningStyles.filter(s => s !== style));
    } else {
      setLearningStyles([...learningStyles, style]);
    }
  };

  const generateContent = async () => {
    setLoading(true);
    try {
      const endpoint = generationType === 'curriculum' 
        ? '/api/test/multi-step-generation'
        : '/api/test/multi-step-lesson';
      
      const payload = generationType === 'curriculum'
        ? { subject, gradeLevel, prompt, learningStyles }
        : { subject, gradeLevel, duration, objectives, learningStyles };
      
      const response = await axios.post(endpoint, payload);
      setResult(response.data);
      toast({
        title: 'Generation completed',
        description: `AI ${generationType} generated successfully`,
      });
    } catch (error) {
      console.error(`Error generating ${generationType}:`, error);
      toast({
        title: 'Error',
        description: `Failed to generate ${generationType}`,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-6">AI Content Generator</h1>
      <p className="text-muted-foreground mb-8">
        Generate curriculum and lesson plans using multi-step iterative refinement with enhanced contextual prompting
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Panel: Controls */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Generation Settings</CardTitle>
            <CardDescription>
              Configure the parameters for AI content generation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Content Type</Label>
              <Select 
                value={generationType} 
                onValueChange={(value: GenerationType) => setGenerationType(value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="curriculum">Curriculum</SelectItem>
                  <SelectItem value="lesson">Lesson Plan</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input 
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Mathematics, Science, English"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Grade Level</Label>
              <Select 
                value={gradeLevel} 
                onValueChange={setGradeLevel}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select grade level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Kindergarten">Kindergarten</SelectItem>
                  <SelectItem value="Grade 1">Grade 1</SelectItem>
                  <SelectItem value="Grade 2">Grade 2</SelectItem>
                  <SelectItem value="Grade 3">Grade 3</SelectItem>
                  <SelectItem value="Grade 4">Grade 4</SelectItem>
                  <SelectItem value="Grade 5">Grade 5</SelectItem>
                  <SelectItem value="Grade 6">Grade 6</SelectItem>
                  <SelectItem value="Grade 7">Grade 7</SelectItem>
                  <SelectItem value="Grade 8">Grade 8</SelectItem>
                  <SelectItem value="Grade 9">Grade 9</SelectItem>
                  <SelectItem value="Grade 10">Grade 10</SelectItem>
                  <SelectItem value="Grade 11">Grade 11</SelectItem>
                  <SelectItem value="Grade 12">Grade 12</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {generationType === 'curriculum' && (
              <div className="space-y-2">
                <Label>Prompt</Label>
                <Textarea 
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe the curriculum you want to generate"
                  rows={4}
                />
              </div>
            )}
            
            {generationType === 'lesson' && (
              <>
                <div className="space-y-2">
                  <Label>Duration (minutes)</Label>
                  <Input 
                    type="number" 
                    value={duration}
                    onChange={(e) => setDuration(parseInt(e.target.value))}
                    min={15}
                    max={180}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Learning Objectives</Label>
                  <Textarea 
                    value={objectives}
                    onChange={(e) => setObjectives(e.target.value)}
                    placeholder="What students should learn from this lesson"
                    rows={3}
                  />
                </div>
              </>
            )}
            
            <div className="space-y-2">
              <Label>Learning Styles</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="visual"
                    checked={learningStyles.includes('visual')}
                    onCheckedChange={() => handleLearningStyleToggle('visual')}
                  />
                  <label htmlFor="visual" className="text-sm">Visual</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="auditory"
                    checked={learningStyles.includes('auditory')}
                    onCheckedChange={() => handleLearningStyleToggle('auditory')}
                  />
                  <label htmlFor="auditory" className="text-sm">Auditory</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="kinesthetic"
                    checked={learningStyles.includes('kinesthetic')}
                    onCheckedChange={() => handleLearningStyleToggle('kinesthetic')}
                  />
                  <label htmlFor="kinesthetic" className="text-sm">Kinesthetic</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="reading"
                    checked={learningStyles.includes('reading/writing')}
                    onCheckedChange={() => handleLearningStyleToggle('reading/writing')}
                  />
                  <label htmlFor="reading" className="text-sm">Reading/Writing</label>
                </div>
              </div>
            </div>
            
            <Button 
              onClick={generateContent} 
              disabled={loading}
              className="w-full mt-4"
            >
              {loading ? (
                <><Spinner className="mr-2" /> Generating...</>
              ) : (
                `Generate ${generationType === 'curriculum' ? 'Curriculum' : 'Lesson Plan'}`
              )}
            </Button>
          </CardContent>
        </Card>
        
        {/* Right Panel: Results */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Generation Results</CardTitle>
            <CardDescription>
              View the multi-step generation process and results
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!result && !loading ? (
              <div className="flex flex-col items-center justify-center h-96 text-center">
                <p className="text-muted-foreground mb-4">Configure your settings and click generate to see results</p>
                <p className="text-xs text-muted-foreground">The multi-step generation process may take 15-30 seconds</p>
              </div>
            ) : loading ? (
              <div className="flex flex-col items-center justify-center h-96">
                <Spinner size="lg" />
                <p className="mt-4 text-muted-foreground">Generating content with multi-step refinement...</p>
                <p className="text-xs text-muted-foreground mt-2">This involves structure, content, and activities generation phases</p>
              </div>
            ) : (
              <Tabs defaultValue="result">
                <TabsList className="mb-4">
                  <TabsTrigger value="result">Final Result</TabsTrigger>
                  <TabsTrigger value="prompt">Enhanced Prompt</TabsTrigger>
                  <TabsTrigger value="context">Context Data</TabsTrigger>
                </TabsList>
                
                <TabsContent value="result">
                  <h3 className="font-semibold text-lg mb-2">
                    Generated {generationType === 'curriculum' ? 'Curriculum' : 'Lesson Plan'}
                  </h3>
                  <div className="bg-secondary/50 p-4 rounded-md overflow-auto max-h-[600px]">
                    <pre className="whitespace-pre-wrap font-mono text-xs">
                      {result?.result}
                    </pre>
                  </div>
                </TabsContent>
                
                <TabsContent value="prompt">
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-semibold text-lg mb-2">Original Prompt</h3>
                      <div className="bg-secondary/50 p-4 rounded-md">
                        {result?.originalPrompt}
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="font-semibold text-lg mb-2">Enhanced Prompt with Knowledge Base</h3>
                      <div className="bg-secondary/50 p-4 rounded-md overflow-auto max-h-[300px]">
                        <pre className="whitespace-pre-wrap font-mono text-xs">
                          {result?.enhancedPrompt}
                        </pre>
                      </div>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="context">
                  <h3 className="font-semibold text-lg mb-2">Contextual Information</h3>
                  <div className="bg-secondary/50 p-4 rounded-md overflow-auto max-h-[500px]">
                    <pre className="whitespace-pre-wrap font-mono text-xs">
                      {JSON.stringify(result?.contextData, null, 2)}
                    </pre>
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}