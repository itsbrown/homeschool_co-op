import { useState, useEffect } from "react";

interface HighlightElementProps {
  target: string;
  onElementClick?: () => void;
  /** Soft border breathe for findability; never an aggressive glow. */
  pulseAnimation?: boolean;
  overlayZIndex?: number;
  clickZIndex?: number;
}

/**
 * Spotlight cutout for interactive tutorials.
 * Soft neutral scrim + calm primary ring (shared by Schedule Builder and other tours).
 */
export default function HighlightElement({
  target,
  onElementClick,
  pulseAnimation = true,
  overlayZIndex = 9998,
  clickZIndex = 9999,
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
        className={`tutorial-spotlight fixed pointer-events-none ${
          pulseAnimation ? "tutorial-spotlight--breathe" : ""
        }`}
        style={{
          zIndex: overlayZIndex,
          top: rect.top - 8,
          left: rect.left - 8,
          width: rect.width + 16,
          height: rect.height + 16,
        }}
        data-testid="highlight-spotlight"
      />
      <div
        className="fixed cursor-pointer"
        style={{
          zIndex: clickZIndex,
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
