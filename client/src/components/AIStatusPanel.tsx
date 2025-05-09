import React from 'react';
import { useAIStatus } from '@/hooks/useAIStatus';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';

interface AIStatusPanelProps {
  className?: string;
  compact?: boolean;
}

/**
 * Component that displays the current status of AI services
 * 
 * Can be used in compact mode for just a status indicator,
 * or full mode for detailed status information
 */
export const AIStatusPanel: React.FC<AIStatusPanelProps> = ({ 
  className = '',
  compact = false
}) => {
  const { 
    isAIAvailable, 
    aiStatus, 
    statusMessage, 
    isEnhancedAIAvailable,
    enhancedAIMessage,
    errorMessage, 
    isLoading, 
    refetch 
  } = useAIStatus();
  
  // Simple badge for compact mode
  if (compact) {
    if (isLoading) {
      return (
        <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200 animate-pulse">
          Checking AI...
        </Badge>
      );
    }
    
    if (isAIAvailable) {
      // Always show enhanced AI when AI is available (as per user requirement)
      return (
        <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 flex items-center gap-1">
          <CheckCircle size={12} />
          <span>Enhanced AI</span>
        </Badge>
      );
    }
    
    return (
      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 flex items-center gap-1">
        <AlertCircle size={12} />
        <span>AI Fallback Mode</span>
      </Badge>
    );
  }
  
  // Full status panel for dashboard
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex justify-between items-center">
          <span>AI System Status</span>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => refetch()} 
            disabled={isLoading}
            className="h-8 w-8 p-0"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            <span className="sr-only">Refresh status</span>
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-2">
        {errorMessage ? (
          <Alert variant="destructive" className="mb-2">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3">
            {/* Combined AI status display */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">AI Status:</span>
                {isAIAvailable ? (
                  <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 flex items-center gap-1">
                    <CheckCircle size={12} />
                    <span>Enhanced AI Active</span>
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 flex items-center gap-1">
                    <AlertCircle size={12} />
                    <span>Using Fallback</span>
                  </Badge>
                )}
              </div>
              <p className="text-sm text-slate-600">
                {isAIAvailable 
                  ? "AI curriculum generation with knowledge base integration is active" 
                  : "AI is currently unavailable, using template-based generation"
                }
              </p>
            </div>
            
            {/* Knowledge base integration capabilities */}
            <div className="space-y-2 border-t pt-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">Knowledge Integration:</span>
                {isAIAvailable ? (
                  <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 flex items-center gap-1">
                    <CheckCircle size={12} />
                    <span>Available</span>
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200 flex items-center gap-1">
                    <AlertCircle size={12} />
                    <span>Unavailable</span>
                  </Badge>
                )}
              </div>
              <p className="text-sm text-slate-600">
                {isAIAvailable 
                  ? "Selected knowledge bases will be semantically analyzed and incorporated into generated curricula" 
                  : "Knowledge base integration is unavailable while in fallback mode"
                }
              </p>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="pt-1">
        <p className="text-xs text-slate-500">
          {!isAIAvailable && !errorMessage ? "The system is currently using built-in templates instead of AI-generated content." : ""}
        </p>
      </CardFooter>
    </Card>
  );
};

export default AIStatusPanel;