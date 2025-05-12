import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { BrainCircuit, Cloud, Zap } from 'lucide-react';

export default function AIStatusPanel() {
  const { data: aiStatus, isLoading } = useQuery({
    queryKey: ['/api/ai/status'],
    queryFn: () => fetch('/api/ai/status').then(res => res.json()),
  });

  const isAIAvailable = aiStatus?.anthropic?.available;
  const aiServiceStatus = aiStatus?.anthropic?.status;

  return (
    <Card className="border-dashed border border-primary/30 bg-background/50">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <BrainCircuit className="h-4 w-4 text-primary" />
          AI Services Status
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="flex flex-wrap gap-3">
          {isLoading ? (
            <div className="flex items-center gap-2">
              <div className="animate-pulse h-2 w-2 rounded-full bg-muted-foreground"></div>
              <span className="text-xs">Checking services status...</span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${isAIAvailable ? 'bg-green-500' : 'bg-amber-500'}`}></div>
                <span className="text-xs mr-1">Anthropic Claude:</span>
                <Badge variant={isAIAvailable ? "default" : "outline"} className="text-[10px] py-0 px-2 h-4">
                  {isAIAvailable ? "Available" : "Limited"}
                </Badge>
              </div>

              <div className="flex items-center gap-2">
                <Zap className="h-3 w-3 text-amber-500" />
                <span className="text-xs mr-1">AI Enhancement:</span>
                <Badge variant="secondary" className="text-[10px] py-0 px-2 h-4">
                  {aiServiceStatus === 'operational' ? "Active" : "Standby"}
                </Badge>
              </div>

              <div className="flex items-center gap-2">
                <Cloud className="h-3 w-3 text-blue-500" />
                <span className="text-xs mr-1">Generator Mode:</span>
                <Badge variant="secondary" className="text-[10px] py-0 px-2 h-4">
                  {isAIAvailable ? "AI-Enhanced" : "Template-Based"}
                </Badge>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}