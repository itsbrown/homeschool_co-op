import { useEffect, useState, useCallback } from "react";
import { useStaffGuideOptional } from "@/contexts/StaffGuideContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

interface StaffGuideHighlightProps {
  stepNumber: number;
  targetTestId: string;
  position?: "top" | "bottom" | "left" | "right";
}

export default function StaffGuideHighlight({ stepNumber, targetTestId, position = "bottom" }: StaffGuideHighlightProps) {
  const guide = useStaffGuideOptional();
  const [rect, setRect] = useState<DOMRect | null>(null);

  const activeStep = guide?.activeStep ?? null;
  const clearStep = guide?.clearStep;
  const isActive = !!guide && activeStep?.number === stepNumber;

  const updatePosition = useCallback(() => {
    const el = document.querySelector(`[data-testid="${targetTestId}"]`) as HTMLElement;
    if (el) {
      setRect(el.getBoundingClientRect());
    }
  }, [targetTestId]);

  useEffect(() => {
    if (!isActive) {
      setRect(null);
      return;
    }

    const timer = setTimeout(updatePosition, 300);

    const observer = new MutationObserver(() => {
      if (!rect) updatePosition();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    const pollInterval = setInterval(() => {
      if (!rect) updatePosition();
    }, 500);

    const stopPolling = setTimeout(() => clearInterval(pollInterval), 5000);

    return () => {
      clearTimeout(timer);
      clearTimeout(stopPolling);
      clearInterval(pollInterval);
      observer.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isActive, targetTestId, updatePosition, rect]);

  if (!guide || !clearStep || !activeStep || !isActive || !rect) return null;

  const tooltipStyle: React.CSSProperties = {
    position: "fixed",
    zIndex: 9999,
  };

  const GAP = 12;

  if (position === "bottom") {
    tooltipStyle.top = rect.bottom + GAP;
    tooltipStyle.left = Math.max(8, Math.min(rect.left, window.innerWidth - 296));
  } else if (position === "top") {
    tooltipStyle.bottom = window.innerHeight - rect.top + GAP;
    tooltipStyle.left = Math.max(8, Math.min(rect.left, window.innerWidth - 296));
  } else if (position === "right") {
    tooltipStyle.top = Math.max(8, Math.min(rect.top, window.innerHeight - 200));
    tooltipStyle.left = Math.min(rect.right + GAP, window.innerWidth - 296);
  } else if (position === "left") {
    tooltipStyle.top = Math.max(8, Math.min(rect.top, window.innerHeight - 200));
    tooltipStyle.right = Math.max(8, window.innerWidth - rect.left + GAP);
  }

  const arrowStyle: React.CSSProperties = {
    position: "absolute",
    width: 12,
    height: 12,
    background: "white",
    borderColor: "inherit",
    transform: "rotate(45deg)",
  };

  if (position === "bottom") {
    arrowStyle.top = -6;
    arrowStyle.left = 20;
    arrowStyle.borderTop = "1px solid #e5e7eb";
    arrowStyle.borderLeft = "1px solid #e5e7eb";
  } else if (position === "top") {
    arrowStyle.bottom = -6;
    arrowStyle.left = 20;
    arrowStyle.borderBottom = "1px solid #e5e7eb";
    arrowStyle.borderRight = "1px solid #e5e7eb";
  } else if (position === "right") {
    arrowStyle.top = 16;
    arrowStyle.left = -6;
    arrowStyle.borderBottom = "1px solid #e5e7eb";
    arrowStyle.borderLeft = "1px solid #e5e7eb";
  } else if (position === "left") {
    arrowStyle.top = 16;
    arrowStyle.right = -6;
    arrowStyle.borderTop = "1px solid #e5e7eb";
    arrowStyle.borderRight = "1px solid #e5e7eb";
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 z-[9998]"
        onClick={clearStep}
      />

      <div
        style={{
          position: "fixed",
          top: rect.top - 4,
          left: rect.left - 4,
          width: rect.width + 8,
          height: rect.height + 8,
          zIndex: 9999,
          borderRadius: 8,
          boxShadow: "0 0 0 4px rgba(16, 185, 129, 0.6), 0 0 0 9999px rgba(0,0,0,0.15)",
          pointerEvents: "none",
        }}
      />

      <div
        style={tooltipStyle}
        className="bg-white rounded-lg shadow-xl border border-gray-200 p-4 max-w-xs w-72 z-[9999]"
        data-testid="staff-guide-highlight"
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Badge className="bg-emerald-100 text-emerald-700 text-xs">
              Step {activeStep.number}
            </Badge>
            <span className="font-semibold text-sm text-gray-900">{activeStep.title}</span>
          </div>
          <button
            onClick={clearStep}
            className="text-gray-400 hover:text-gray-600 transition-colors p-0.5"
            data-testid="staff-guide-highlight-dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-gray-600">{activeStep.summary}</p>
        <div className="mt-3 flex justify-end">
          <Button size="sm" variant="outline" onClick={clearStep} className="text-xs h-7">
            Got it
          </Button>
        </div>

        <div style={arrowStyle} />
      </div>
    </>
  );
}
