import { useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { storeItemDetailPath } from "@/lib/store-catalog";

/** Redirect /store/:slug/item/:listingId → canonical slug URL. */
export default function PublicStoreItemLegacyRedirect() {
  const { schoolSlug = "", listingId = "" } = useParams<{ schoolSlug: string; listingId: string }>();
  const [, setLocation] = useLocation();

  const { data, isError } = useQuery({
    queryKey: ["/api/public/store", schoolSlug, "catalog", listingId],
    queryFn: async () => {
      const res = await fetch(`/api/public/store/${schoolSlug}/catalog/${listingId}`);
      if (!res.ok) throw new Error("Item not found");
      return res.json() as Promise<{ item: { slug: string } }>;
    },
    enabled: !!schoolSlug && !!listingId,
  });

  useEffect(() => {
    if (data?.item?.slug) {
      setLocation(storeItemDetailPath(schoolSlug, data.item.slug), { replace: true });
    }
  }, [data, schoolSlug, setLocation]);

  if (isError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8 text-center">
        <p className="text-muted-foreground">This item is not available.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8 text-muted-foreground">
      Loading…
    </div>
  );
}
