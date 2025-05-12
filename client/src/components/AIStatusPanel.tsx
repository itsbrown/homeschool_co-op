import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BrainCircuit, Cloud, Zap } from 'lucide-react';
import { useAIStatus } from '@/hooks/useAIStatus';

export default function AIStatusPanel() {
  const { isAIAvailable, isEnhancedAIAvailable, aiStatus, enhancedAIStatus, statusMessage, enhancedAIMessage, isLoading } = useAIStatus();

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
                <div className={`h-2 w-2 rounded-full ${isEnhancedAIAvailable ? 'bg-green-500' : 'bg-amber-500'}`}></div>
                <span className="text-xs mr-1">Enhanced AI:</span>
                <Badge variant={isEnhancedAIAvailable ? "default" : "outline"} className="text-[10px] py-0 px-2 h-4">
                  {isEnhancedAIAvailable ? "Available" : "Limited"}
                </Badge>
              </div>
            </>
          )}
        </div>
        
        {!isLoading && (
          <div className="mt-3 text-xs text-muted-foreground">
            <p>{statusMessage}</p>
            {enhancedAIMessage !== 'Enhanced AI status unknown' && (
              <p className="mt-1">{enhancedAIMessage}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}