import { useState, useEffect } from "react";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";

type StoreProductCardImageProps = {
  src?: string | null;
  alt: string;
  className?: string;
  "data-testid"?: string;
  /**
   * cover: square crop for catalog cards.
   * contain: full image, centered, for the product detail hero.
   */
  fit?: "cover" | "contain";
};

/**
 * Public store product photo.
 * Catalog cards stay a square `object-cover` crop.
 * The detail hero uses `contain` so the whole file is visible.
 * Do not pair `aspect-square` with `max-height` on that hero: the used width
 * shrinks to the max height and the square stays left-aligned in the card.
 */
export function StoreProductCardImage({
  src,
  alt,
  className,
  "data-testid": dataTestId,
  fit = "cover",
}: StoreProductCardImageProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const contain = fit === "contain";

  if (!src) {
    return (
      <div
        className={cn(
          contain
            ? "flex min-h-[240px] w-full items-center justify-center bg-white"
            : "aspect-square bg-muted flex items-center justify-center rounded-t-lg",
          className,
        )}
        aria-hidden
      >
        <Package className="h-10 w-10 text-muted-foreground/40" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden",
        contain
          ? "flex w-full items-center justify-center bg-white"
          : "aspect-square rounded-t-lg bg-muted",
        contain && failed && "min-h-[240px]",
        className,
      )}
    >
      <img
        src={src}
        alt={alt}
        className={cn(
          contain
            ? "block h-auto w-full max-h-[min(70vh,520px)] object-contain object-center"
            : "h-full w-full object-cover",
          failed && "opacity-0",
        )}
        loading="lazy"
        data-testid={dataTestId}
        onError={() => setFailed(true)}
      />
      {failed ? (
        <div
          className="absolute inset-0 flex items-center justify-center bg-muted"
          aria-hidden
        >
          <Package className="h-10 w-10 text-muted-foreground/40" />
        </div>
      ) : null}
    </div>
  );
}
