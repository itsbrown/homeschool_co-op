import type { MouseEvent } from "react";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { StoreCatalogItem } from "@/lib/store-catalog";
import { buildStoreItemSharePayload } from "@/lib/store-item-share";

type StoreItemShareButtonProps = {
  item: StoreCatalogItem;
  schoolSlug: string;
  sharerUserId?: number | null;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "icon";
  className?: string;
  label?: string;
};

export function StoreItemShareButton({
  item,
  schoolSlug,
  sharerUserId = null,
  variant = "outline",
  size = "sm",
  className,
  label = "Share",
}: StoreItemShareButtonProps) {
  const { toast } = useToast();

  const handleShare = async (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const payload = buildStoreItemSharePayload(item, schoolSlug, { sharerUserId });

    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: payload.title,
          text: payload.text,
          url: payload.url,
        });
        return;
      }

      await navigator.clipboard.writeText(payload.text);
      toast({
        title: "Copied to clipboard",
        description: "Share message includes the item description and link.",
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(payload.text);
        toast({
          title: "Copied to clipboard",
          description: "Share message includes the item description and link.",
        });
      } catch {
        toast({
          title: "Could not share",
          description: "Please copy the link manually.",
          variant: "destructive",
        });
      }
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      onClick={handleShare}
      data-testid={`store-share-${item.listingId}`}
      aria-label={`Share ${item.title}`}
    >
      <Share2 className={size === "icon" ? "h-4 w-4" : "h-4 w-4 mr-2"} aria-hidden />
      {size !== "icon" ? label : null}
    </Button>
  );
}
