import { useState } from "react";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";

type StoreProductCardImageProps = {
  src?: string | null;
  alt: string;
  className?: string;
  "data-testid"?: string;
};

/** Square cropped image for public store product cards. */
export function StoreProductCardImage({
  src,
  alt,
  className,
  "data-testid": dataTestId,
}: StoreProductCardImageProps) {
  if (!src) {
    return (
      <div
        className={cn(
          "aspect-square bg-muted flex items-center justify-center rounded-t-lg",
          className,
        )}
        aria-hidden
      >
        <Package className="h-10 w-10 text-muted-foreground/40" />
      </div>
    );
  }

  return (
    <div className={cn("aspect-square overflow-hidden rounded-t-lg bg-muted", className)}>
      <img
        src={src}
        alt={alt}
        className="h-full w-full object-cover"
        loading="lazy"
        data-testid={dataTestId}
      />
    </div>
  );
}
