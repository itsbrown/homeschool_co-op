import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

export default function PublicStoreManagerPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const base = "/api/school-admin/public-store";

  const { data: settings } = useQuery({
    queryKey: [base, "settings"],
    queryFn: async () => {
      const res = await apiRequest("GET", `${base}/settings`);
      return res.json();
    },
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
      const res = await apiRequest("PATCH", `${base}/settings`, {
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
      queryClient.invalidateQueries({ queryKey: [base, "settings"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const { data: products = [] } = useQuery({
    queryKey: [base, "products"],
    queryFn: async () => {
      const res = await apiRequest("GET", `${base}/products`);
      return res.json();
    },
  });

  const { data: listings = [] } = useQuery({
    queryKey: [base, "listings"],
    queryFn: async () => {
      const res = await apiRequest("GET", `${base}/listings`);
      return res.json();
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: [base, "orders"],
    queryFn: async () => {
      const res = await apiRequest("GET", `${base}/orders`);
      return res.json();
    },
  });

  const [productForm, setProductForm] = useState({
    name: "",
    priceCents: 0,
    description: "",
  });

  const createProduct = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `${base}/products`, {
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
      queryClient.invalidateQueries({ queryKey: [base, "products"] });
    },
  });

  const previewUrl = slug ? `${window.location.origin}/store/${slug}` : "";

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Public Store</h1>

      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="listings">Listings</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
        </TabsList>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Store settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Switch checked={enabled} onCheckedChange={setEnabled} />
                <Label>Enable public store</Label>
              </div>
              <div>
                <Label>Store URL slug</Label>
                <Input value={slug || settings?.storeSlug || ""} onChange={(e) => setSlug(e.target.value)} placeholder="american-seekers-academy" />
                {previewUrl && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Preview: <a href={previewUrl} className="text-blue-700 underline">{previewUrl}</a>
                  </p>
                )}
              </div>
              <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>
                Save settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products">
          <Card>
            <CardHeader>
              <CardTitle>Add merch product</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Name" value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} />
              <Input type="number" placeholder="Price (USD)" value={productForm.priceCents || ""} onChange={(e) => setProductForm({ ...productForm, priceCents: parseFloat(e.target.value) || 0 })} />
              <Input placeholder="Description" value={productForm.description} onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} />
              <Button onClick={() => createProduct.mutate()}>Create product</Button>
              <ul className="text-sm space-y-1 pt-4">
                {products.map((p: any) => (
                  <li key={p.id}>{p.name} — ${(p.priceCents / 100).toFixed(2)}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="listings">
          <Card>
            <CardHeader>
              <CardTitle>Published listings</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-2">
                {listings.filter((l: any) => l.isPublished).map((l: any) => (
                  <li key={l.id}>
                    {l.listingType} #{l.sourceId}
                    {l.membersOnly ? " (members only)" : " (open)"}
                  </li>
                ))}
              </ul>
              <p className="text-sm text-muted-foreground mt-4">
                Publish programs from Sessions or Classes using the &quot;List on public store&quot; checkbox on save.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <CardTitle>Store orders</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-2">
                {orders.map((o: any) => (
                  <li key={o.id}>
                    #{o.id} — {o.parentEmail} — {o.status} — ${(o.totalCents / 100).toFixed(2)}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
