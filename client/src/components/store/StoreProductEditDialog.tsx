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
import { ImageUpload } from "@/components/ImageUpload";
import { useToast } from "@/hooks/use-toast";
import { ExternalLink } from "lucide-react";

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
};

function formFromProduct(product: EditableStoreProduct): EditFormState {
  return {
    name: product.name,
    description: product.description ?? "",
    priceDollars: product.priceCents / 100,
    imageUrl: product.imageUrl ?? "",
    isPublished: product.isPublished ?? false,
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
  const [form, setForm] = useState<EditFormState>({
    name: "",
    description: "",
    priceDollars: 0,
    imageUrl: "",
    isPublished: false,
  });

  useEffect(() => {
    if (product && open) {
      setForm(formFromProduct(product));
    }
  }, [product, open]);

  const updateForm = (patch: Partial<EditFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const saveProduct = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error("No product selected");
      const priceCents = Math.round(form.priceDollars * 100);
      if (!form.name.trim() || priceCents <= 0) {
        throw new Error("Name and a price greater than $0 are required");
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

  const isAffiliate = product?.productKind === "affiliate";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto"
        data-testid="edit-product-dialog"
      >
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
            <Input
              id="edit-product-description"
              value={form.description}
              onChange={(e) => updateForm({ description: e.target.value })}
              data-testid="input-edit-product-description"
            />
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
          {isAffiliate && product?.asin ? (
            <p className="text-xs text-muted-foreground">
              ASIN {product.asin}
              {product.affiliateUrl ? (
                <>
                  {" · "}
                  <a
                    href={product.affiliateUrl}
                    target="_blank"
                    rel="noopener noreferrer sponsored"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    Affiliate link
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => saveProduct.mutate()}
            disabled={saveProduct.isPending || !form.name.trim() || form.priceDollars <= 0}
            data-testid="button-save-product"
          >
            {saveProduct.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
