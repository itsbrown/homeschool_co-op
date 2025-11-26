import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { X, ChevronLeft, ChevronRight, CheckCircle, AlertCircle } from "lucide-react";

export interface TourStep {
  target: string;
  title: string;
  content: string;
  placement?: "top" | "bottom" | "left" | "right" | "center";
  highlight?: boolean;
  isImportant?: boolean;
}

const defaultTourSteps: TourStep[] = [
  {
    target: "body",
    title: "Welcome to Your Parent Dashboard!",
    content: "Let's take a quick tour to help you get started. This will only take a minute.",
    placement: "center",
  },
  {
    target: "[data-tour='children-section']",
    title: "Register Your Children",
    content: "Start by adding your children here. Click 'Add Child' to register each child you want to enroll in classes.",
    placement: "bottom",
    highlight: true,
  },
  {
    target: "[data-tour='classes-section']",
    title: "Browse Available Classes",
    content: "Once your children are registered, browse our catalog of classes. You can filter by category and view class details.",
    placement: "bottom",
    highlight: true,
  },
  {
    target: "[data-tour='enrollment-info']",
    title: "How Enrollment Works",
    content: "When you find a class, add it to your cart. You can select payment plans that fit your budget.",
    placement: "center",
    isImportant: true,
  },
  {
    target: "[data-tour='payment-important']",
    title: "Important: Enrollment Confirmation",
    content: "Your child is NOT enrolled until the first payment is made. Adding to cart reserves a spot, but enrollment is only confirmed after you complete checkout and make your first payment.",
    placement: "center",
    isImportant: true,
  },
  {
    target: "[data-tour='cart-section']",
    title: "Your Shopping Cart",
    content: "Review your cart before checkout. You can choose payment plans like Full Payment, Deposit, or Biweekly payments.",
    placement: "bottom",
    highlight: true,
  },
  {
    target: "[data-tour='payments-section']",
    title: "Manage Payments",
    content: "View your payment history, upcoming payments, and make payments for scheduled installments here.",
    placement: "bottom",
    highlight: true,
  },
  {
    target: "[data-tour='profile-section']",
    title: "Your Profile",
    content: "Update your contact information, emergency contacts, and account settings in your profile.",
    placement: "bottom",
    highlight: true,
  },
  {
    target: "body",
    title: "You're All Set!",
    content: "You're ready to start enrolling your children in classes. If you need help, you can restart this tour from your profile settings. Happy learning!",
    placement: "center",
  },
];

interface OnboardingTourProps {
  steps?: TourStep[];
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export default function OnboardingTour({
  steps = defaultTourSteps,
  isOpen,
  onClose,
  onComplete,
}: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });

  const currentStepData = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;

  // Reset to first step whenever tour opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
    }
  }, [isOpen]);

  const calculatePosition = useCallback(() => {
    if (!currentStepData || currentStepData.placement === "center") {
      setTooltipPosition({
        top: window.innerHeight / 2 - 150,
        left: window.innerWidth / 2 - 200,
      });
      return;
    }

    const target = document.querySelector(currentStepData.target);
    if (!target) {
      setTooltipPosition({
        top: window.innerHeight / 2 - 150,
        left: window.innerWidth / 2 - 200,
      });
      return;
    }

    const rect = target.getBoundingClientRect();
    const scrollTop = window.scrollY;
    const scrollLeft = window.scrollX;

    let top = 0;
    let left = 0;

    switch (currentStepData.placement) {
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

    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentStepData]);

  useEffect(() => {
    if (isOpen) {
      calculatePosition();
      window.addEventListener("resize", calculatePosition);
      return () => window.removeEventListener("resize", calculatePosition);
    }
  }, [isOpen, currentStep, calculatePosition]);

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (!isFirstStep) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSkip = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-[9998]"
        onClick={handleSkip}
        data-testid="tour-overlay"
      />

      {currentStepData?.highlight && currentStepData.target !== "body" && (
        <HighlightElement target={currentStepData.target} />
      )}

      <Card
        className="fixed z-[9999] w-[400px] max-w-[90vw] shadow-2xl animate-in fade-in-0 zoom-in-95"
        style={{
          top: tooltipPosition.top,
          left: tooltipPosition.left,
        }}
        data-testid="tour-tooltip"
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              {currentStepData?.isImportant && (
                <AlertCircle className="h-5 w-5 text-amber-500" />
              )}
              <CardTitle className="text-lg">{currentStepData?.title}</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 -mr-2 -mt-2"
              onClick={handleSkip}
              data-testid="tour-close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className={`text-sm text-muted-foreground ${currentStepData?.isImportant ? 'font-medium text-amber-700 dark:text-amber-400' : ''}`}>
            {currentStepData?.content}
          </p>
        </CardContent>
        <CardFooter className="flex justify-between pt-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Step {currentStep + 1} of {steps.length}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
              className="text-xs"
              data-testid="tour-skip"
            >
              Skip Tour
            </Button>
          </div>
          <div className="flex gap-2">
            {!isFirstStep && (
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevious}
                data-testid="tour-previous"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleNext}
              data-testid="tour-next"
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
            {steps.map((_, index) => (
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

function HighlightElement({ target }: { target: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const element = document.querySelector(target);
    if (element) {
      const updateRect = () => setRect(element.getBoundingClientRect());
      updateRect();
      window.addEventListener("resize", updateRect);
      window.addEventListener("scroll", updateRect);
      return () => {
        window.removeEventListener("resize", updateRect);
        window.removeEventListener("scroll", updateRect);
      };
    }
  }, [target]);

  if (!rect) return null;

  return (
    <div
      className="fixed z-[9998] pointer-events-none"
      style={{
        top: rect.top - 8,
        left: rect.left - 8,
        width: rect.width + 16,
        height: rect.height + 16,
        boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.5)",
        borderRadius: "8px",
        border: "2px solid hsl(var(--primary))",
      }}
    />
  );
}

export { defaultTourSteps };
