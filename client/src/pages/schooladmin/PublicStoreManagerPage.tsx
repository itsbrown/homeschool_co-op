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

  const { data: products = [] } = useQuery({
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
  });

  const createProduct = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/school-admin/public-store/products", {
        name: productForm.name,
        description: productForm.description || null,
        priceCents: Math.round(productForm.priceCents * 100),
      });
      if (!res.ok) throw new Error("Failed to create product");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Product created" });
      setProductForm({ name: "", priceCents: 0, description: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/school-admin/public-store/products"] });
    },
  });

  const previewUrl = slug ? `${window.location.origin}/store/${slug}` : "";

  return (
    <SchoolAdminLayout pageTitle="Public Store">
      <div className="max-w-4xl mx-auto space-y-6">
        <Tabs defaultValue="settings">
          <TabsList>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="listings">Listings</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
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
                <Button onClick={() => createProduct.mutate()}>Create product</Button>
                <ul className="text-sm space-y-1 pt-4">
                  {products.map((p: { id: number; name: string; priceCents: number }) => (
                    <li key={p.id}>
                      {p.name} — ${(p.priceCents / 100).toFixed(2)}
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
