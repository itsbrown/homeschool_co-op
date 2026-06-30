import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import SchoolAdminLayout from "@/components/layout/SchoolAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ExternalLink } from "lucide-react";
import { ImageUpload } from "@/components/ImageUpload";
import { StoreProductCardImage } from "@/components/store/StoreProductCardImage";

type StoreProduct = {
  id: number;
  name: string;
  priceCents: number;
  description?: string | null;
  imageUrl?: string | null;
};

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

  useEffect(() => {
    if (settings) {
      setSlug(settings.storeSlug ?? "");
      setEnabled(settings.publicStoreEnabled ?? false);
    }
  }, [settings]);

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
    onSuccess: () => {
      toast({ title: "Store settings saved" });
      queryClient.invalidateQueries({ queryKey: settingsKey });
      queryClient.invalidateQueries({ queryKey: ["/api/school-admin/features"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const { data: products = [] } = useQuery<StoreProduct[]>({
    queryKey: ["/api/school-admin/public-store/products"],
  });

  const { data: listings = [] } = useQuery({
    queryKey: ["/api/school-admin/public-store/listings"],
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["/api/school-admin/public-store/orders"],
  });

  const [productForm, setProductForm] = useState({
    name: "",
    priceCents: 0,
    description: "",
    imageUrl: "",
  });

  const createProduct = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/school-admin/public-store/products", {
        name: productForm.name,
        description: productForm.description || null,
        priceCents: Math.round(productForm.priceCents * 100),
        imageUrl: productForm.imageUrl || null,
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
      setProductForm({ name: "", priceCents: 0, description: "", imageUrl: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/school-admin/public-store/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/school-admin/public-store/listings"] });
    },
  });

  const previewUrl = slug ? `${window.location.origin}/store/${slug}` : "";

  return (
    <SchoolAdminLayout pageTitle="Public Store">
      <div className="max-w-4xl mx-auto space-y-6">
        <Tabs defaultValue="settings">
          <TabsList>
            <TabsTrigger value="settings" data-testid="store-tab-settings">Settings</TabsTrigger>
            <TabsTrigger value="products" data-testid="store-tab-products">Products</TabsTrigger>
            <TabsTrigger value="listings" data-testid="store-tab-listings">Listings</TabsTrigger>
            <TabsTrigger value="orders" data-testid="store-tab-orders">Orders</TabsTrigger>
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

          <TabsContent value="products" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Merch products</CardTitle>
                <CardDescription>Optional items sold alongside programs on your public store.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  placeholder="Name"
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                />
                <Input
                  type="number"
                  placeholder="Price (USD)"
                  value={productForm.priceCents || ""}
                  onChange={(e) =>
                    setProductForm({ ...productForm, priceCents: parseFloat(e.target.value) || 0 })
                  }
                />
                <Input
                  placeholder="Description"
                  value={productForm.description}
                  onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                />
                <div>
                  <Label className="mb-2 block">Product photo</Label>
                  <ImageUpload
                    value={productForm.imageUrl}
                    onChange={(url) => setProductForm({ ...productForm, imageUrl: url })}
                    uploadEndpoint="/api/school-admin/public-store/upload/product-image"
                    previewAspectClass="aspect-square"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Shown as a square crop on the public store. JPEG, PNG, GIF, or WebP — max 5MB.
                  </p>
                </div>
                <Button
                  onClick={() => createProduct.mutate()}
                  disabled={!productForm.name.trim()}
                  data-testid="button-create-store-product"
                >
                  Create product
                </Button>
                <ul className="grid gap-3 pt-4 sm:grid-cols-2">
                  {products.map((p) => (
                    <li
                      key={p.id}
                      className="flex gap-3 rounded-lg border p-2 text-sm items-center"
                    >
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md">
                        <StoreProductCardImage src={p.imageUrl} alt={p.name} className="rounded-md h-full" />
                      </div>
                      <div>
                        <p className="font-medium">{p.name}</p>
                        <p className="text-muted-foreground">${(p.priceCents / 100).toFixed(2)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="listings" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Published listings</CardTitle>
                <CardDescription>
                  Programs and products currently visible on your public store.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {listings.filter((l: { isPublished: boolean }) => l.isPublished).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No published listings yet. Open{" "}
                    <a href="/schools/sessions" className="text-blue-700 underline">
                      Sessions
                    </a>{" "}
                    or Classes, check <strong>List on public store</strong>, and save.
                  </p>
                ) : (
                  <ul className="text-sm space-y-2">
                    {listings
                      .filter((l: { isPublished: boolean }) => l.isPublished)
                      .map((l: { id: number; listingType: string; sourceId: number; membersOnly?: boolean }) => (
                        <li key={l.id}>
                          {l.listingType} #{l.sourceId}
                          {l.membersOnly ? " (members only)" : " (open)"}
                        </li>
                      ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="orders" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Store orders</CardTitle>
                <CardDescription>Guest and member purchases through the public store lane.</CardDescription>
              </CardHeader>
              <CardContent>
                {orders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No store orders yet.</p>
                ) : (
                  <ul className="text-sm space-y-2">
                    {orders.map(
                      (o: { id: number; parentEmail: string; status: string; totalCents: number }) => (
                        <li key={o.id}>
                          #{o.id} — {o.parentEmail} — {o.status} — ${(o.totalCents / 100).toFixed(2)}
                        </li>
                      ),
                    )}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </SchoolAdminLayout>
  );
}
