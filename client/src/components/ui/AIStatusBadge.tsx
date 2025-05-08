import React from 'react';
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle } from "lucide-react";

interface AIStatusBadgeProps {
  isAIAvailable: boolean;
  component: string;
  className?: string;
}

/**
 * A component that displays the AI service status
 * Used to inform users when AI services are in fallback mode
 */
export const AIStatusBadge: React.FC<AIStatusBadgeProps> = ({ 
  isAIAvailable, 
  component,
  className = ""
}) => {
  if (isAIAvailable) {
    return (
      <Badge variant="outline" className={`bg-green-50 text-green-700 border-green-200 ${className}`}>
        AI Powered
      </Badge>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`bg-amber-50 text-amber-700 border-amber-200 flex items-center gap-1 ${className}`}>
            <AlertTriangle size={12} />
            <span>AI Fallback</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>AI service for {component} is currently unavailable.</p>
          <p>Using built-in templates instead.</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default AIStatusBadge;