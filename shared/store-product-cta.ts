export type StoreProductCta =
  | {
      kind: "amazon";
      href: string;
      label: "Buy on Amazon";
      rel: "noopener noreferrer sponsored";
    }
  | {
      kind: "external";
      href: string;
      label: "View product";
      rel: "noopener noreferrer";
    }
  | { kind: "cart" };

function hostnameOf(urlString: string): string | null {
  try {
    return new URL(urlString.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Amazon product pages, regional amazon.* hosts, and Associates short links. */
export function isAmazonStoreUrl(urlString: string): boolean {
  const host = hostnameOf(urlString);
  if (!host) return false;
  if (host === "amzn.to" || host === "a.co" || host.endsWith(".amzn.to")) return true;
  return /(^|\.)amazon\.[a-z.]+$/i.test(host);
}

export function storeProductCta(input: { affiliateUrl?: string | null }): StoreProductCta {
  const href = (input.affiliateUrl ?? "").trim();
  if (!href) return { kind: "cart" };
  if (isAmazonStoreUrl(href)) {
    return {
      kind: "amazon",
      href,
      label: "Buy on Amazon",
      rel: "noopener noreferrer sponsored",
    };
  }
  return {
    kind: "external",
    href,
    label: "View product",
    rel: "noopener noreferrer",
  };
}

/** Outbound vendor links (Amazon or otherwise) never go through Stripe. */
export function storeProductIsCartPurchasable(affiliateUrl?: string | null): boolean {
  return storeProductCta({ affiliateUrl }).kind === "cart";
}
