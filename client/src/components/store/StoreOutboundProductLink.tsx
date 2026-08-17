import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { storeProductCta } from "@shared/store-product-cta";

export function StoreOutboundProductLink({
  url,
  className,
  testId,
  variant = "default",
}: {
  url: string;
  className?: string;
  testId: string;
  variant?: "default" | "outline";
}) {
  const cta = storeProductCta({ affiliateUrl: url });
  if (cta.kind === "cart") return null;
  return (
    <Button asChild variant={variant} className={className} data-testid={testId}>
      <a href={cta.href} target="_blank" rel={cta.rel}>
        {cta.label}
        <ExternalLink className="ml-2 h-4 w-4" aria-hidden />
      </a>
    </Button>
  );
}
