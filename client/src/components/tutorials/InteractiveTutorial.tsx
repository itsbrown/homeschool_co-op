import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { X, ChevronLeft, ChevronRight, CheckCircle, Play, MousePointerClick } from "lucide-react";
import HighlightElement from "./HighlightElement";

export interface TutorialStep {
  target: string;
  title: string;
  content: string;
  placement?: "top" | "bottom" | "left" | "right" | "center";
  route?: string;
  waitForNavigation?: boolean;
  actionText?: string;
}

export interface InteractiveTutorialDefinition {
  id: string;
  title: string;
  description: string;
  steps: TutorialStep[];
}

interface InteractiveTutorialContextType {
  activeTutorial: InteractiveTutorialDefinition | null;
  currentStep: number;
  startTutorial: (tutorial: InteractiveTutorialDefinition) => void;
  endTutorial: () => void;
  nextStep: () => void;
  previousStep: () => void;
  isActive: boolean;
}

const InteractiveTutorialContext = createContext<InteractiveTutorialContextType | null>(null);

export function useInteractiveTutorial() {
  const context = useContext(InteractiveTutorialContext);
  if (!context) {
    throw new Error("useInteractiveTutorial must be used within InteractiveTutorialProvider");
  }
  return context;
}

interface InteractiveTutorialProviderProps {
  children: React.ReactNode;
}

export function InteractiveTutorialProvider({ children }: InteractiveTutorialProviderProps) {
  const [activeTutorial, setActiveTutorial] = useState<InteractiveTutorialDefinition | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [location, setLocation] = useLocation();

  const startTutorial = useCallback((tutorial: InteractiveTutorialDefinition) => {
    setActiveTutorial(tutorial);
    setCurrentStep(0);
    
    const firstStep = tutorial.steps[0];
    if (firstStep.route && location !== firstStep.route) {
      setLocation(firstStep.route);
    }
  }, [location, setLocation]);

  const endTutorial = useCallback(() => {
    setActiveTutorial(null);
    setCurrentStep(0);
  }, []);

  const nextStep = useCallback(() => {
    if (!activeTutorial) return;
    
    if (currentStep < activeTutorial.steps.length - 1) {
      const nextStepData = activeTutorial.steps[currentStep + 1];
      
      if (nextStepData.route && location !== nextStepData.route) {
        setLocation(nextStepData.route);
      }
      
      setCurrentStep(prev => prev + 1);
    } else {
      endTutorial();
    }
  }, [activeTutorial, currentStep, location, setLocation, endTutorial]);

  const previousStep = useCallback(() => {
    if (currentStep > 0) {
      const prevStepData = activeTutorial?.steps[currentStep - 1];
      
      if (prevStepData?.route && location !== prevStepData.route) {
        setLocation(prevStepData.route);
      }
      
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep, activeTutorial, location, setLocation]);

  const value: InteractiveTutorialContextType = {
    activeTutorial,
    currentStep,
    startTutorial,
    endTutorial,
    nextStep,
    previousStep,
    isActive: activeTutorial !== null,
  };

  return (
    <InteractiveTutorialContext.Provider value={value}>
      {children}
      {activeTutorial && (
        <InteractiveTutorialOverlay
          tutorial={activeTutorial}
          currentStep={currentStep}
          onNext={nextStep}
          onPrevious={previousStep}
          onClose={endTutorial}
        />
      )}
    </InteractiveTutorialContext.Provider>
  );
}

interface InteractiveTutorialOverlayProps {
  tutorial: InteractiveTutorialDefinition;
  currentStep: number;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
}

function InteractiveTutorialOverlay({
  tutorial,
  currentStep,
  onNext,
  onPrevious,
  onClose,
}: InteractiveTutorialOverlayProps) {
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [elementFound, setElementFound] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [, setLocation] = useLocation();
  
  const stepData = tutorial.steps[currentStep];
  const isLastStep = currentStep === tutorial.steps.length - 1;
  const isFirstStep = currentStep === 0;
  const isCentered = stepData.placement === "center" || stepData.target === "body";
  const MAX_RETRIES = 5;

  const calculatePosition = useCallback(() => {
    if (isCentered) {
      setTooltipPosition({
        top: window.innerHeight / 2 - 150,
        left: window.innerWidth / 2 - 200,
      });
      setElementFound(true);
      setRetryCount(0);
      return;
    }

    const target = document.querySelector(stepData.target);
    if (!target) {
      setTooltipPosition({
        top: window.innerHeight / 2 - 150,
        left: window.innerWidth / 2 - 200,
      });
      setElementFound(false);
      return;
    }

    setElementFound(true);
    setRetryCount(0);
    const rect = target.getBoundingClientRect();
    const scrollTop = window.scrollY;
    const scrollLeft = window.scrollX;

    let top = 0;
    let left = 0;

    switch (stepData.placement) {
      case "top":
        top = rect.top + scrollTop - 220;
        left = rect.left + scrollLeft + rect.width / 2 - 200;
        break;
      case "bottom":
        top = rect.bottom + scrollTop + 20;
        left = rect.left + scrollLeft + rect.width / 2 - 200;
        break;
      case "left":
        top = rect.top + scrollTop + rect.height / 2 - 100;
        left = rect.left + scrollLeft - 420;
        break;
      case "right":
        top = rect.top + scrollTop + rect.height / 2 - 100;
        left = rect.right + scrollLeft + 20;
        break;
      default:
        top = rect.bottom + scrollTop + 20;
        left = rect.left + scrollLeft + rect.width / 2 - 200;
    }

    left = Math.max(20, Math.min(left, window.innerWidth - 420));
    top = Math.max(20, top);

    setTooltipPosition({ top, left });
  }, [stepData, isCentered]);

  // Retry logic: attempt to find element multiple times after route changes
  useEffect(() => {
    calculatePosition();
    
    // If element not found and we have retries left, retry after a delay
    if (!elementFound && !isCentered && retryCount < MAX_RETRIES) {
      const retryTimer = setTimeout(() => {
        setRetryCount(prev => prev + 1);
        calculatePosition();
      }, 300);
      return () => clearTimeout(retryTimer);
    }
  }, [calculatePosition, currentStep, elementFound, isCentered, retryCount]);

  useEffect(() => {
    // Reset retry count when step changes
    setRetryCount(0);
    setElementFound(false);
    
    const timer = setTimeout(calculatePosition, 100);
    window.addEventListener("resize", calculatePosition);
    window.addEventListener("scroll", calculatePosition);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", calculatePosition);
      window.removeEventListener("scroll", calculatePosition);
    };
  }, [calculatePosition, currentStep]);
  
  // Handle navigation to step's route if element not found
  const handleNavigateToRoute = () => {
    if (stepData.route) {
      setLocation(stepData.route);
      setRetryCount(0);
      // Allow time for navigation then recalculate
      setTimeout(calculatePosition, 500);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-[9997]"
        data-testid="tutorial-overlay"
      />

      {!isCentered && elementFound && (
        <HighlightElement 
          target={stepData.target} 
          onElementClick={onNext}
          pulseAnimation={true}
        />
      )}

      <Card
        className="fixed z-[10000] w-[400px] max-w-[90vw] shadow-2xl animate-in fade-in-0 zoom-in-95"
        style={{
          top: tooltipPosition.top,
          left: tooltipPosition.left,
        }}
        data-testid="tutorial-tooltip"
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Play className="h-3 w-3" />
                <span>{tutorial.title}</span>
              </div>
              <CardTitle className="text-lg">{stepData.title}</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 -mr-2 -mt-2"
              onClick={onClose}
              data-testid="tutorial-close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="pb-3">
          <p className="text-sm text-muted-foreground">
            {stepData.content}
          </p>
          
          {!isCentered && elementFound && (
            <div className="mt-3 flex items-center gap-2 text-xs text-primary font-medium">
              <MousePointerClick className="h-4 w-4" />
              <span>{stepData.actionText || "Click the highlighted element to continue"}</span>
            </div>
          )}
          
          {!elementFound && !isCentered && (
            <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950 rounded border border-amber-200 dark:border-amber-800">
              <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">
                {retryCount < MAX_RETRIES 
                  ? "Looking for element on this page..." 
                  : "This element is on a different page."}
              </p>
              {retryCount >= MAX_RETRIES && stepData.route && (
                <Button 
                  size="sm" 
                  variant="outline"
                  className="w-full text-xs h-8"
                  onClick={handleNavigateToRoute}
                  data-testid="tutorial-navigate"
                >
                  Go to {stepData.route === '/parent' ? 'Dashboard' : stepData.route === '/parent/children' ? 'My Children' : 'Required Page'}
                </Button>
              )}
              {retryCount >= MAX_RETRIES && !stepData.route && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Click "Next" to continue or navigate manually.
                </p>
              )}
            </div>
          )}
        </CardContent>
        
        <CardFooter className="flex justify-between pt-2 border-t">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Step {currentStep + 1} of {tutorial.steps.length}
            </span>
          </div>
          <div className="flex gap-2">
            {!isFirstStep && (
              <Button
                variant="outline"
                size="sm"
                onClick={onPrevious}
                data-testid="tutorial-previous"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            )}
            <Button
              size="sm"
              onClick={onNext}
              data-testid="tutorial-next"
            >
              {isLastStep ? (
                <>
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Finish
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        </CardFooter>

        <div className="px-6 pb-4">
          <div className="flex gap-1 justify-center">
            {tutorial.steps.map((_, index) => (
              <div
                key={index}
                className={`h-1.5 rounded-full transition-all ${
                  index === currentStep
                    ? "w-6 bg-primary"
                    : index < currentStep
                    ? "w-1.5 bg-primary/60"
                    : "w-1.5 bg-muted"
                }`}
              />
            ))}
          </div>
        </div>
      </Card>
    </>
  );
}
