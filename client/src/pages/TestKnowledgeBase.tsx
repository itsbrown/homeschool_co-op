import { useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/hooks/use-toast';

export default function TestKnowledgeBase() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();

  const testKnowledgeBaseAI = async () => {
    setLoading(true);
    try {
      const response = await axios.post('/api/test/knowledge-base-ai');
      setResult(response.data);
      toast({
        title: 'Test completed successfully',
        description: 'Knowledge base AI integration test completed',
      });
    } catch (error) {
      console.error('Error testing knowledge base AI:', error);
      toast({
        title: 'Error',
        description: 'Failed to test knowledge base AI integration',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-6">Knowledge Base AI Integration Test</h1>
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Test Integration</CardTitle>
          <CardDescription>
            This will create a test knowledge base and use it to enhance an AI prompt for curriculum generation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={testKnowledgeBaseAI} 
            disabled={loading}
            className="w-full"
          >
            {loading ? <><Spinner className="mr-2" /> Testing...</> : 'Run Test'}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Test Results</CardTitle>
            <CardDescription>
              See how knowledge bases enhance AI prompt generation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="kb">
              <TabsList className="mb-4">
                <TabsTrigger value="kb">Knowledge Base</TabsTrigger>
                <TabsTrigger value="prompt">Enhanced Prompt</TabsTrigger>
                <TabsTrigger value="result">AI Result</TabsTrigger>
              </TabsList>
              
              <TabsContent value="kb">
                <h3 className="font-semibold text-lg mb-2">Knowledge Base</h3>
                <div className="bg-secondary/50 p-4 rounded-md">
                  <p><span className="font-semibold">Title:</span> {result.knowledgeBase?.title}</p>
                  <p><span className="font-semibold">Type:</span> {result.knowledgeBase?.type}</p>
                  <p><span className="font-semibold">Subject:</span> {result.knowledgeBase?.subject}</p>
                  <p><span className="font-semibold">Grade Level:</span> {result.knowledgeBase?.gradeLevel}</p>
                  
                  <Separator className="my-4" />
                  
                  <p className="font-semibold">Content:</p>
                  <pre className="bg-muted p-2 rounded mt-2 overflow-auto max-h-[300px] text-xs">
                    {JSON.stringify(result.knowledgeBase?.content, null, 2)}
                  </pre>
                </div>
              </TabsContent>
              
              <TabsContent value="prompt">
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold text-lg mb-2">Base Prompt</h3>
                    <div className="bg-secondary/50 p-4 rounded-md">
                      {result.basePrompt}
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="font-semibold text-lg mb-2">Enhanced Prompt with Knowledge Base</h3>
                    <div className="bg-secondary/50 p-4 rounded-md overflow-auto max-h-[400px]">
                      <pre className="whitespace-pre-wrap font-mono text-xs">
                        {result.enhancedPrompt}
                      </pre>
                    </div>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="result">
                <h3 className="font-semibold text-lg mb-2">Claude-3-7-Sonnet Generated Curriculum</h3>
                <div className="bg-secondary/50 p-4 rounded-md overflow-auto max-h-[500px]">
                  <pre className="whitespace-pre-wrap font-mono text-xs">
                    {result.aiResult}
                  </pre>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}