import { useMemo, useState, type MouseEvent } from "react";
import { Facebook, Link2, Linkedin, Mail, Share2, Smartphone } from "lucide-react";
import { SiX } from "react-icons/si";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import type { StoreCatalogItem } from "@/lib/store-catalog";
import {
  buildStoreItemSharePayload,
  buildStoreItemSocialShareLinks,
} from "@/lib/store-item-share";

type StoreItemShareButtonProps = {
  item: StoreCatalogItem;
  schoolSlug: string;
  sharerUserId?: number | null;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "icon";
  className?: string;
  label?: string;
};

function openShareWindow(url: string): void {
  window.open(url, "_blank", "width=600,height=520,noopener,noreferrer");
}

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
  const [open, setOpen] = useState(false);

  const payload = useMemo(
    () => buildStoreItemSharePayload(item, schoolSlug, { sharerUserId }),
    [item, schoolSlug, sharerUserId],
  );
  const socialLinks = useMemo(() => buildStoreItemSocialShareLinks(payload), [payload]);

  const stopNav = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const copyFullMessage = async () => {
    try {
      await navigator.clipboard.writeText(payload.text);
      toast({
        title: "Copied to clipboard",
        description: "Share message includes the item description and link.",
      });
      setOpen(false);
    } catch {
      toast({
        title: "Could not copy",
        description: "Please copy the link manually.",
        variant: "destructive",
      });
    }
  };

  const nativeShare = async () => {
    if (typeof navigator === "undefined" || !navigator.share) {
      await copyFullMessage();
      return;
    }
    try {
      await navigator.share({
        title: payload.title,
        text: payload.text,
        url: payload.url,
      });
      setOpen(false);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      await copyFullMessage();
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          className={className}
          onClick={stopNav}
          data-testid={`store-share-${item.listingId}`}
          aria-label={`Share ${item.title}`}
        >
          <Share2 className={size === "icon" ? "h-4 w-4" : "h-4 w-4 mr-2"} aria-hidden />
          {size !== "icon" ? label : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-3"
        align="start"
        onClick={stopNav}
        data-testid={`store-share-menu-${item.listingId}`}
      >
        <p className="text-sm font-medium text-slate-900 mb-1">Share this item</p>
        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{item.title}</p>

        <TooltipProvider delayDuration={300}>
          <div className="flex flex-wrap items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => openShareWindow(socialLinks.facebook)}
                  data-testid={`store-share-facebook-${item.listingId}`}
                  aria-label="Share on Facebook"
                >
                  <Facebook className="h-4 w-4 text-blue-600" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Facebook</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => openShareWindow(socialLinks.twitter)}
                  data-testid={`store-share-twitter-${item.listingId}`}
                  aria-label="Share on X"
                >
                  <SiX className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>X (Twitter)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => openShareWindow(socialLinks.linkedin)}
                  data-testid={`store-share-linkedin-${item.listingId}`}
                  aria-label="Share on LinkedIn"
                >
                  <Linkedin className="h-4 w-4 text-blue-700" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>LinkedIn</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  asChild
                >
                  <a
                    href={socialLinks.email}
                    data-testid={`store-share-email-${item.listingId}`}
                    aria-label="Share by email"
                  >
                    <Mail className="h-4 w-4 text-slate-600" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Email</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  onClick={copyFullMessage}
                  data-testid={`store-share-copy-${item.listingId}`}
                  aria-label="Copy share message"
                >
                  <Link2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy message & link</TooltipContent>
            </Tooltip>

            {typeof navigator !== "undefined" && navigator.share && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    onClick={nativeShare}
                    data-testid={`store-share-native-${item.listingId}`}
                    aria-label="More sharing options"
                  >
                    <Smartphone className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>AirDrop, Messages, etc.</TooltipContent>
              </Tooltip>
            )}
          </div>
        </TooltipProvider>
      </PopoverContent>
    </Popover>
  );
}
