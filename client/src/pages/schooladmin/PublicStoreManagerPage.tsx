import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, parseApiErrorMessage } from "@/lib/queryClient";
import SchoolAdminLayout from "@/components/layout/SchoolAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ExternalLink } from "lucide-react";
import { ImageUpload } from "@/components/ImageUpload";
import { StoreProductCardImage } from "@/components/store/StoreProductCardImage";
import { StoreProgramsTab } from "@/components/store/StoreProgramsTab";
import { StoreSignupsTab } from "@/components/store/StoreSignupsTab";

type StoreProduct = {
  id: number;
  name: string;
  priceCents: number;
  description?: string | null;
  imageUrl?: string | null;
  productKind?: "owned" | "affiliate";
  affiliateUrl?: string | null;
  asin?: string | null;
};

type ProductFormState = {
  name: string;
  priceCents: number;
  description: string;
  imageUrl: string;
};

type AffiliateFormState = {
  url: string;
  asin: string;
  name: string;
  priceCents: number;
  description: string;
  imageUrl: string;
  affiliateMetadata: Record<string, unknown>;
  fetched: boolean;
};

const STORE_TAB_KEY = "public-store-manager-tab";
const PRODUCT_DRAFT_KEY = "public-store-manager-product-draft";
const STORE_TABS = new Set(["settings", "programs", "signups", "products", "orders"]);

const emptyProductForm = (): ProductFormState => ({
  name: "",
  priceCents: 0,
  description: "",
  imageUrl: "",
});

const emptyAffiliateForm = (): AffiliateFormState => ({
  url: "",
  asin: "",
  name: "",
  priceCents: 0,
  description: "",
  imageUrl: "",
  affiliateMetadata: {},
  fetched: false,
});

function readInitialTab(): string {
  const fromUrl = new URLSearchParams(window.location.search).get("tab");
  if (fromUrl === "listings") return "programs";
  if (fromUrl === "orders") return "signups";
  if (fromUrl && STORE_TABS.has(fromUrl)) return fromUrl;
  const stored = sessionStorage.getItem(STORE_TAB_KEY);
  if (stored === "listings") return "programs";
  if (stored === "orders") return "signups";
  if (stored && STORE_TABS.has(stored)) return stored;
  return "settings";
}

function readProductDraft(): ProductFormState {
  try {
    const raw = sessionStorage.getItem(PRODUCT_DRAFT_KEY);
    if (!raw) return emptyProductForm();
    const parsed = JSON.parse(raw) as Partial<ProductFormState>;
    return {
      name: parsed.name ?? "",
      priceCents: typeof parsed.priceCents === "number" ? parsed.priceCents : 0,
      description: parsed.description ?? "",
      imageUrl: parsed.imageUrl ?? "",
    };
  } catch {
    return emptyProductForm();
  }
}

export default function PublicStoreManagerPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const settingsKey = ["/api/school-admin/public-store/settings"];

  const { data: settings } = useQuery<{
    publicStoreEnabled?: boolean;
    storeSlug?: string;
  }>({
    queryKey: settingsKey,
  });

  const [slug, setSlug] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState(readInitialTab);
  const settingsHydrated = useRef(false);

  useEffect(() => {
    if (settings && !settingsHydrated.current) {
      setSlug(settings.storeSlug ?? "");
      setEnabled(settings.publicStoreEnabled ?? false);
      settingsHydrated.current = true;
    }
  }, [settings]);

  useEffect(() => {
    sessionStorage.setItem(STORE_TAB_KEY, activeTab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", activeTab);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }, [activeTab]);

  const saveSettings = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/school-admin/public-store/settings", {
        storeSlug: slug,
        publicStoreEnabled: enabled,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Save failed");
      }
      return res.json();
    },
    onSuccess: (updated) => {
      toast({ title: "Store settings saved" });
      setSlug(updated.storeSlug ?? slug);
      setEnabled(updated.publicStoreEnabled ?? enabled);
      settingsHydrated.current = true;
      queryClient.invalidateQueries({ queryKey: settingsKey });
      queryClient.invalidateQueries({ queryKey: ["/api/school-admin/features"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const { data: products = [] } = useQuery<StoreProduct[]>({
    queryKey: ["/api/school-admin/public-store/products"],
  });

  const [productForm, setProductForm] = useState<ProductFormState>(readProductDraft);
  const [affiliateForm, setAffiliateForm] = useState<AffiliateFormState>(emptyAffiliateForm);

  useEffect(() => {
    sessionStorage.setItem(PRODUCT_DRAFT_KEY, JSON.stringify(productForm));
  }, [productForm]);

  const updateProductForm = (patch: Partial<ProductFormState>) => {
    setProductForm((prev) => ({ ...prev, ...patch }));
  };

  const updateAffiliateForm = (patch: Partial<AffiliateFormState>) => {
    setAffiliateForm((prev) => ({ ...prev, ...patch }));
  };

  const createProduct = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/school-admin/public-store/products", {
        name: productForm.name,
        description: productForm.description || null,
        priceCents: Math.round(productForm.priceCents * 100),
        imageUrl: productForm.imageUrl || null,
        productKind: "owned",
      });
      if (!res.ok) throw new Error("Failed to create product");
      const product = (await res.json()) as StoreProduct;

      const listingRes = await apiRequest("POST", "/api/school-admin/public-store/listings", {
        listingType: "product",
        sourceId: product.id,
        isPublished: true,
        membersOnly: false,
      });
      if (!listingRes.ok) throw new Error("Product created but failed to publish listing");

      return product;
    },
    onSuccess: () => {
      toast({ title: "Product created and listed on store" });
      const cleared = emptyProductForm();
      setProductForm(cleared);
      sessionStorage.removeItem(PRODUCT_DRAFT_KEY);
      queryClient.invalidateQueries({ queryKey: ["/api/school-admin/public-store/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/school-admin/public-store/programs"] });
    },
  });

  const fetchAffiliate = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        "/api/school-admin/public-store/affiliate/preview",
        { url: affiliateForm.url.trim() },
        { passthroughStatuses: [400, 502, 503] },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || "Failed to fetch Amazon product");
      return body as {
        asin: string;
        name: string;
        description: string | null;
        priceCents: number | null;
        imageUrl: string | null;
        affiliateUrl: string;
        affiliateMetadata: Record<string, unknown>;
      };
    },
    onSuccess: (preview) => {
      setAffiliateForm((prev) => ({
        ...prev,
        asin: preview.asin,
        name: preview.name,
        description: preview.description || "",
        priceCents: preview.priceCents != null ? preview.priceCents / 100 : 0,
        imageUrl: preview.imageUrl || "",
        affiliateMetadata: preview.affiliateMetadata || {},
        fetched: true,
      }));
      toast({ title: "Product details loaded from Amazon" });
    },
    onError: (e: Error) =>
      toast({ title: parseApiErrorMessage(e, "Failed to fetch Amazon product"), variant: "destructive" }),
  });

  const createAffiliate = useMutation({
    mutationFn: async () => {
      const priceCents = Math.round(affiliateForm.priceCents * 100);
      if (!affiliateForm.asin || !affiliateForm.url.trim() || !affiliateForm.name.trim() || priceCents <= 0) {
        throw new Error("Fetch a product and confirm name and price before creating");
      }
      const res = await apiRequest(
        "POST",
        "/api/school-admin/public-store/products",
        {
          name: affiliateForm.name,
          description: affiliateForm.description || null,
          priceCents,
          imageUrl: affiliateForm.imageUrl || null,
          productKind: "affiliate",
          affiliateUrl: affiliateForm.url.trim(),
          asin: affiliateForm.asin,
          affiliateMetadata: affiliateForm.affiliateMetadata,
        },
        { passthroughStatuses: [400, 503] },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to create affiliate product");
      }
      const product = (await res.json()) as StoreProduct;

      const listingRes = await apiRequest("POST", "/api/school-admin/public-store/listings", {
        listingType: "product",
        sourceId: product.id,
        isPublished: true,
        membersOnly: false,
      });
      if (!listingRes.ok) throw new Error("Product created but failed to publish listing");

      return product;
    },
    onSuccess: () => {
      toast({ title: "Affiliate product listed on store" });
      setAffiliateForm(emptyAffiliateForm());
      queryClient.invalidateQueries({ queryKey: ["/api/school-admin/public-store/products"] });
    },
    onError: (e: Error) =>
      toast({
        title: parseApiErrorMessage(e, "Failed to create affiliate product"),
        variant: "destructive",
      }),
  });

  const previewUrl = slug ? `${window.location.origin}/store/${slug}` : "";

  return (
    <SchoolAdminLayout pageTitle="Public Store">
      <div className="max-w-4xl mx-auto space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="settings" data-testid="store-tab-settings">Settings</TabsTrigger>
            <TabsTrigger value="programs" data-testid="store-tab-programs">Classes &amp; programs</TabsTrigger>
            <TabsTrigger value="signups" data-testid="store-tab-signups">Sign-ups</TabsTrigger>
            <TabsTrigger value="products" data-testid="store-tab-products">Products</TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Store settings</CardTitle>
                <CardDescription>
                  Turn on your school&apos;s public storefront and choose a URL families can bookmark.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Switch checked={enabled} onCheckedChange={setEnabled} />
                  <Label>Enable public store</Label>
                </div>
                <div>
                  <Label>Store URL slug</Label>
                  <Input
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="american-seekers-academy"
                  />
                  {previewUrl && (
                    <p className="text-sm text-muted-foreground mt-2 flex items-center gap-1">
                      <a
                        href={previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-700 underline inline-flex items-center gap-1"
                      >
                        {previewUrl}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </p>
                  )}
                </div>
                <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>
                  Save settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="programs" className="mt-4">
            <StoreProgramsTab storeEnabled={enabled} />
          </TabsContent>

          <TabsContent value="signups" className="mt-4">
            <StoreSignupsTab />
          </TabsContent>

          <TabsContent value="products" className="mt-4 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Merch products</CardTitle>
                <CardDescription>Optional items sold alongside programs on your public store.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  placeholder="Name"
                  value={productForm.name}
                  onChange={(e) => updateProductForm({ name: e.target.value })}
                />
                <Input
                  type="number"
                  placeholder="Price (USD)"
                  value={productForm.priceCents || ""}
                  onChange={(e) =>
                    updateProductForm({ priceCents: parseFloat(e.target.value) || 0 })
                  }
                />
                <Input
                  placeholder="Description"
                  value={productForm.description}
                  onChange={(e) => updateProductForm({ description: e.target.value })}
                />
                <div>
                  <Label className="mb-2 block">Product photo</Label>
                  <ImageUpload
                    value={productForm.imageUrl}
                    onChange={(url) => updateProductForm({ imageUrl: url })}
                    uploadCategory="storeProducts"
                    previewAspectClass="aspect-square"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Shown as a square crop on the public store. JPEG, PNG, GIF, or WebP — max 5MB.
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={() => createProduct.mutate()}
                  disabled={!productForm.name.trim()}
                  data-testid="button-create-store-product"
                >
                  Create product
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Amazon affiliate</CardTitle>
                <CardDescription>
                  Paste a product page (/dp/…), an amzn.to short link, or an Associates
                  search link that includes the book ISBN.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    placeholder="https://www.amazon.com/dp/B0XXXXXXXX?tag=yourtag-20"
                    value={affiliateForm.url}
                    onChange={(e) => updateAffiliateForm({ url: e.target.value, fetched: false })}
                    data-testid="input-affiliate-url"
                    aria-describedby="affiliate-url-hint"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => fetchAffiliate.mutate()}
                    disabled={!affiliateForm.url.trim() || fetchAffiliate.isPending}
                    data-testid="button-fetch-affiliate"
                  >
                    {fetchAffiliate.isPending ? "Fetching…" : "Fetch product"}
                  </Button>
                </div>
                <p id="affiliate-url-hint" className="text-xs text-muted-foreground">
                  Search links work when the query includes an ISBN (13-digit 978…).
                  Otherwise open the item and copy the URL with <span className="font-medium">/dp/</span>.
                </p>

                {affiliateForm.fetched && (
                  <div
                    className="space-y-3 rounded-lg border p-3 bg-slate-50/80"
                    data-testid="affiliate-preview-fields"
                  >
                    <div className="flex gap-3 items-start">
                      <StoreProductCardImage
                        src={affiliateForm.imageUrl || null}
                        alt={affiliateForm.name || "Amazon product"}
                        className="rounded-md h-20 w-20 shrink-0"
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <Input
                          placeholder="Name"
                          value={affiliateForm.name}
                          onChange={(e) => updateAffiliateForm({ name: e.target.value })}
                          data-testid="input-affiliate-name"
                        />
                        <Input
                          type="number"
                          placeholder="Display price (USD)"
                          value={affiliateForm.priceCents || ""}
                          onChange={(e) =>
                            updateAffiliateForm({ priceCents: parseFloat(e.target.value) || 0 })
                          }
                          data-testid="input-affiliate-price"
                        />
                        <Input
                          placeholder="Description"
                          value={affiliateForm.description}
                          onChange={(e) => updateAffiliateForm({ description: e.target.value })}
                          data-testid="input-affiliate-description"
                        />
                        <p className="text-xs text-muted-foreground">
                          ASIN {affiliateForm.asin}. Display price is a snapshot; Amazon checkout is
                          authoritative.
                        </p>
                      </div>
                    </div>
                    <div>
                      <Label className="mb-2 block">Cover photo</Label>
                      <ImageUpload
                        value={
                          affiliateForm.imageUrl.startsWith("/public/") ||
                          affiliateForm.imageUrl.startsWith("/uploads/")
                            ? affiliateForm.imageUrl
                            : ""
                        }
                        onChange={(url) => updateAffiliateForm({ imageUrl: url })}
                        uploadCategory="storeProducts"
                        previewAspectClass="aspect-square"
                      />
                      <p className="text-xs text-muted-foreground mt-2">
                        Amazon fills this when PA-API is configured. If the cover is missing, upload one.
                      </p>
                    </div>
                    <Button
                      type="button"
                      onClick={() => createAffiliate.mutate()}
                      disabled={
                        createAffiliate.isPending ||
                        !affiliateForm.name.trim() ||
                        !affiliateForm.asin ||
                        affiliateForm.priceCents <= 0
                      }
                      data-testid="button-create-affiliate-product"
                    >
                      Create affiliate product
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Listed products</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {products.map((p) => (
                    <li
                      key={p.id}
                      className="flex gap-3 rounded-lg border p-2 text-sm items-center"
                      data-testid={`store-admin-product-${p.id}`}
                    >
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md">
                        <StoreProductCardImage src={p.imageUrl} alt={p.name} className="rounded-md h-full" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium truncate">{p.name}</p>
                          {p.productKind === "affiliate" ? (
                            <Badge variant="secondary" data-testid={`affiliate-badge-${p.id}`}>
                              Amazon
                            </Badge>
                          ) : (
                            <Badge variant="outline">Merch</Badge>
                          )}
                        </div>
                        <p className="text-muted-foreground">${(p.priceCents / 100).toFixed(2)}</p>
                        {p.productKind === "affiliate" && p.affiliateUrl ? (
                          <a
                            href={p.affiliateUrl}
                            target="_blank"
                            rel="noopener noreferrer sponsored"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            Affiliate link <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </SchoolAdminLayout>
  );
}
