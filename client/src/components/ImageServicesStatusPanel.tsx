import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Paintbrush, Cloud, Zap } from 'lucide-react';
import { useImageServicesStatus } from '@/hooks/useImageServicesStatus';

export default function ImageServicesStatusPanel() {
  const { 
    isHuggingFaceAvailable,
    huggingFaceStatus,
    isSageMakerAvailable,
    sageMakerStatus,
    preferredService,
    anyServiceAvailable,
    isLoading
  } = useImageServicesStatus();

  return (
    <Card className="border-dashed border border-primary/30 bg-background/50">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Paintbrush className="h-4 w-4 text-primary" />
          Image Generation Services
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
                <div className={`h-2 w-2 rounded-full ${isHuggingFaceAvailable ? 'bg-green-500' : 'bg-amber-500'}`}></div>
                <span className="text-xs mr-1">Hugging Face:</span>
                <Badge variant={isHuggingFaceAvailable ? "default" : "outline"} className="text-[10px] py-0 px-2 h-4">
                  {isHuggingFaceAvailable ? "Available" : "Unavailable"}
                </Badge>
              </div>

              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${isSageMakerAvailable ? 'bg-green-500' : 'bg-amber-500'}`}></div>
                <span className="text-xs mr-1">SageMaker:</span>
                <Badge variant={isSageMakerAvailable ? "default" : "outline"} className="text-[10px] py-0 px-2 h-4">
                  {isSageMakerAvailable ? "Available" : "Unavailable"}
                </Badge>
              </div>

              {preferredService !== 'none' && (
                <div className="w-full mt-2 flex items-center gap-2">
                  <Zap className="h-3 w-3 text-amber-500" />
                  <span className="text-xs">
                    Active: {preferredService.charAt(0).toUpperCase() + preferredService.slice(1)}
                  </span>
                </div>
              )}

              {!anyServiceAvailable && (
                <div className="w-full mt-2 flex items-center gap-2">
                  <Cloud className="h-3 w-3 text-red-500" />
                  <span className="text-xs text-red-500">All image services unavailable</span>
                </div>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}