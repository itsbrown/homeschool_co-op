import React from 'react';
import { useAIStatusContext } from '@/contexts/AIStatusContext';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertCircle, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AIStatusBadgeProps {
  className?: string;
}

/**
 * A simple badge component that shows the current AI status
 * For use in headers, navbars, etc.
 */
export const AIStatusBadge: React.FC<AIStatusBadgeProps> = ({ className }) => {
  const { isAIAvailable, isLoading } = useAIStatusContext();
  
  if (isLoading) {
    return (
      <Badge variant="outline" className={cn("bg-slate-100 text-slate-700 border-slate-200", className)}>
        <RotateCw size={12} className="mr-1 animate-spin" />
        <span>Checking AI...</span>
      </Badge>
    );
  }
  
  if (isAIAvailable) {
    const { isEnhancedAIAvailable } = useAIStatusContext();
    
    if (isEnhancedAIAvailable) {
      return (
        <Badge 
          variant="outline" 
          className={cn("bg-indigo-50 text-indigo-700 border-indigo-200 flex items-center gap-1", className)}
        >
          <CheckCircle size={12} />
          <span>Enhanced AI</span>
        </Badge>
      );
    }
    
    return (
      <Badge 
        variant="outline" 
        className={cn("bg-green-50 text-green-700 border-green-200 flex items-center gap-1", className)}
      >
        <CheckCircle size={12} />
        <span>AI Online</span>
      </Badge>
    );
  }
  
  return (
    <Badge 
      variant="outline" 
      className={cn("bg-amber-50 text-amber-700 border-amber-200 flex items-center gap-1", className)}
    >
      <AlertCircle size={12} />
      <span>AI Fallback Mode</span>
    </Badge>
  );
};

export default AIStatusBadge;