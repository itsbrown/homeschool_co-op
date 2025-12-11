import { useState, useEffect } from "react";

interface HighlightElementProps {
  target: string;
  onElementClick?: () => void;
  pulseAnimation?: boolean;
}

export default function HighlightElement({ 
  target, 
  onElementClick,
  pulseAnimation = true 
}: HighlightElementProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const element = document.querySelector(target);
    if (element) {
      const updateRect = () => setRect(element.getBoundingClientRect());
      updateRect();
      
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      
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
    <>
      <div
        className={`fixed z-[9998] pointer-events-none ${pulseAnimation ? 'animate-pulse' : ''}`}
        style={{
          top: rect.top - 8,
          left: rect.left - 8,
          width: rect.width + 16,
          height: rect.height + 16,
          boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.6)",
          borderRadius: "8px",
          border: "3px solid hsl(var(--primary))",
        }}
        data-testid="highlight-spotlight"
      />
      <div
        className="fixed z-[9999] cursor-pointer"
        style={{
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          background: "transparent",
        }}
        onClick={onElementClick}
        data-testid="highlight-clickable"
      />
    </>
  );
}
