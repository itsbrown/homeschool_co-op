import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, parseApiErrorMessage } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ImageUpload } from "@/components/ImageUpload";
import { useToast } from "@/hooks/use-toast";

export type EditableStoreProduct = {
  id: number;
  name: string;
  priceCents: number;
  description?: string | null;
  imageUrl?: string | null;
  productKind?: "owned" | "affiliate";
  affiliateUrl?: string | null;
  asin?: string | null;
  listingId?: number | null;
  isPublished?: boolean;
};

type EditFormState = {
  name: string;
  description: string;
  priceDollars: number;
  imageUrl: string;
  isPublished: boolean;
  productUrl: string;
};

function formFromProduct(product: EditableStoreProduct): EditFormState {
  return {
    name: product.name,
    description: product.description ?? "",
    priceDollars: product.priceCents / 100,
    imageUrl: product.imageUrl ?? "",
    isPublished: product.isPublished ?? false,
    productUrl: product.affiliateUrl ?? "",
  };
}

export function StoreProductEditDialog({
  product,
  open,
  onOpenChange,
}: {
  product: EditableStoreProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [form, setForm] = useState<EditFormState>({
    name: "",
    description: "",
    priceDollars: 0,
    imageUrl: "",
    isPublished: false,
    productUrl: "",
  });

  useEffect(() => {
    if (product && open) {
      setForm(formFromProduct(product));
      setConfirmingDelete(false);
    }
  }, [product, open]);

  const updateForm = (patch: Partial<EditFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const isAffiliate = product?.productKind === "affiliate";
  const trimmedUrl = form.productUrl.trim();
  const affiliateUrlMissing = isAffiliate && !trimmedUrl;

  const saveProduct = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error("No product selected");
      const priceCents = Math.round(form.priceDollars * 100);
      if (!form.name.trim() || priceCents <= 0) {
        throw new Error("Name and a price greater than $0 are required");
      }
      if (isAffiliate && !trimmedUrl) {
        throw new Error("Affiliate link is required");
      }
      const res = await apiRequest(
        "PATCH",
        `/api/school-admin/public-store/products/${product.id}`,
        {
          name: form.name.trim(),
          description: form.description.trim() || null,
          priceCents,
          imageUrl: form.imageUrl || null,
          isPublished: form.isPublished,
          affiliateUrl: trimmedUrl || null,
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to update product");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Product updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/school-admin/public-store/products"] });
      onOpenChange(false);
    },
    onError: (e: Error) =>
      toast({
        title: parseApiErrorMessage(e, "Failed to update product"),
        variant: "destructive",
      }),
  });

  const deleteProduct = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error("No product selected");
      const res = await apiRequest(
        "DELETE",
        `/api/school-admin/public-store/products/${product.id}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to delete product");
      }
    },
    onSuccess: () => {
      toast({ title: "Product deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/school-admin/public-store/products"] });
      setConfirmingDelete(false);
      onOpenChange(false);
    },
    onError: (e: Error) =>
      toast({
        title: parseApiErrorMessage(e, "Failed to delete product"),
        variant: "destructive",
      }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto"
        data-testid="edit-product-dialog"
      >
        {confirmingDelete ? (
          <>
            <DialogHeader>
              <DialogTitle>Delete this product?</DialogTitle>
              <DialogDescription>
                It will leave the shop. Supply list rows keep the name. Past orders keep
                their line names.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmingDelete(false)}
                disabled={deleteProduct.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => deleteProduct.mutate()}
                disabled={deleteProduct.isPending}
                data-testid="button-confirm-delete-product"
              >
                {deleteProduct.isPending ? "Deleting…" : "Delete product"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Edit product</DialogTitle>
              <DialogDescription>
                Update the listing families see on your public store.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.isPublished}
                  onCheckedChange={(checked) => updateForm({ isPublished: checked })}
                  data-testid="switch-edit-product-published"
                />
                <Label>List on public store</Label>
              </div>
              <div>
                <Label htmlFor="edit-product-name">Name</Label>
                <Input
                  id="edit-product-name"
                  value={form.name}
                  onChange={(e) => updateForm({ name: e.target.value })}
                  data-testid="input-edit-product-name"
                />
              </div>
              <div>
                <Label htmlFor="edit-product-price">Price (USD)</Label>
                <Input
                  id="edit-product-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.priceDollars || ""}
                  onChange={(e) => updateForm({ priceDollars: parseFloat(e.target.value) || 0 })}
                  data-testid="input-edit-product-price"
                />
                {isAffiliate ? (
                  <p className="text-xs text-muted-foreground mt-1">
                    Display price is a snapshot; Amazon checkout is authoritative.
                  </p>
                ) : null}
              </div>
              <div>
                <Label htmlFor="edit-product-description">Description</Label>
                <Textarea
                  id="edit-product-description"
                  value={form.description}
                  onChange={(e) => updateForm({ description: e.target.value })}
                  rows={4}
                  data-testid="input-edit-product-description"
                />
              </div>
              <div>
                <Label htmlFor="edit-product-url">
                  {isAffiliate ? "Affiliate link" : "Product link"}
                </Label>
                <Input
                  id="edit-product-url"
                  type="url"
                  value={form.productUrl}
                  onChange={(e) => updateForm({ productUrl: e.target.value })}
                  placeholder={
                    isAffiliate
                      ? "https://www.amazon.com/dp/…"
                      : "https://vendor.example/product"
                  }
                  required={isAffiliate}
                  data-testid={
                    isAffiliate ? "input-edit-product-affiliate-url" : "input-edit-product-link"
                  }
                />
                {isAffiliate ? (
                  <p className="text-xs text-muted-foreground mt-1">
                    {product?.asin ? `ASIN ${product.asin}. ` : ""}
                    Families open this URL (Buy on Amazon).
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">
                    If set, families open this URL instead of adding to cart.
                  </p>
                )}
              </div>
              <div>
                <Label className="mb-2 block">Product photo</Label>
                <div className="w-36">
                  <ImageUpload
                    value={form.imageUrl}
                    onChange={(url) => updateForm({ imageUrl: url })}
                    uploadCategory="storeProducts"
                    previewAspectClass="aspect-square"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Shown as a square crop on the public store. JPEG, PNG, GIF, or WebP — max 5MB.
                </p>
              </div>
            </div>
            <DialogFooter className="sm:justify-between gap-2">
              <Button
                type="button"
                variant="destructive"
                onClick={() => setConfirmingDelete(true)}
                disabled={saveProduct.isPending}
                data-testid="button-delete-product"
              >
                Delete
              </Button>
              <div className="flex flex-col-reverse sm:flex-row gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => saveProduct.mutate()}
                  disabled={
                    saveProduct.isPending ||
                    !form.name.trim() ||
                    form.priceDollars <= 0 ||
                    affiliateUrlMissing
                  }
                  data-testid="button-save-product"
                >
                  {saveProduct.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
