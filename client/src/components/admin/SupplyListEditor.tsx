import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Download, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SupplyOwnerType, SupplyScope } from "@shared/supply-list";
import { SUPPLY_CSV_TEMPLATE } from "@shared/supply-list-csv";
import { SupplyListCsvImportDialog } from "./SupplyListCsvImportDialog";

type DraftItem = {
  key: string;
  name: string;
  quantity: number;
  unit: string;
  scope: SupplyScope;
  required: boolean;
  notes: string;
  storeProductId: number | null;
};

type ShopProduct = {
  id: number;
  name: string;
  productKind: "owned" | "affiliate";
  listingSlug: string | null;
};

type CopySources = {
  classes: Array<{ id: number; name: string }>;
  sessions: Array<{ id: number; name: string }>;
};

function newDraft(partial?: Partial<DraftItem>): DraftItem {
  return {
    key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: "",
    quantity: 1,
    unit: "",
    scope: "student",
    required: true,
    notes: "",
    storeProductId: null,
    ...partial,
  };
}

export function SupplyListEditor({
  ownerType,
  ownerId,
  ownerLabel,
}: {
  ownerType: SupplyOwnerType;
  ownerId: number;
  ownerLabel?: string;
}) {
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [copyValue, setCopyValue] = useState("");
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const blob = new Blob([SUPPLY_CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "supply-list-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const listQuery = useQuery<{ items: Array<{
    id: number;
    name: string;
    quantity: number;
    unit: string | null;
    scope: SupplyScope;
    required: boolean;
    notes: string | null;
    storeProductId: number | null;
  }> }>({
    queryKey: ["/api/supply-lists", ownerType, ownerId],
    enabled: Number.isFinite(ownerId) && ownerId > 0,
  });

  const productsQuery = useQuery<{ products: ShopProduct[] }>({
    queryKey: ["/api/supply-lists/shop-products"],
  });

  const sourcesQuery = useQuery<CopySources>({
    queryKey: ["/api/supply-lists/copy-sources"],
  });

  useEffect(() => {
    if (!listQuery.data?.items) return;
    setDrafts(
      listQuery.data.items.map((item) =>
        newDraft({
          key: `id-${item.id}`,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit ?? "",
          scope: item.scope,
          required: item.required,
          notes: item.notes ?? "",
          storeProductId: item.storeProductId,
        }),
      ),
    );
  }, [listQuery.data]);

  const products = productsQuery.data?.products ?? [];

  const copyOptions = useMemo(() => {
    const classes = (sourcesQuery.data?.classes ?? [])
      .filter((c) => !(ownerType === "class" && c.id === ownerId))
      .map((c) => ({ value: `class:${c.id}`, label: `Class: ${c.name}` }));
    const sessions = (sourcesQuery.data?.sessions ?? [])
      .filter((s) => !(ownerType === "session" && s.id === ownerId))
      .map((s) => ({ value: `session:${s.id}`, label: `Session: ${s.name}` }));
    return [...classes, ...sessions];
  }, [sourcesQuery.data, ownerType, ownerId]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const items = drafts
        .filter((d) => d.name.trim().length > 0)
        .map((d) => ({
          name: d.name.trim(),
          quantity: d.quantity,
          unit: d.unit.trim() || null,
          scope: d.scope,
          required: d.required,
          notes: d.notes.trim() || null,
          storeProductId: d.storeProductId,
        }));
      const res = await apiRequest("PUT", `/api/supply-lists/${ownerType}/${ownerId}`, { items });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to save supply list");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supply-lists", ownerType, ownerId] });
      toast({ title: "Supply list saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Could not save", description: err.message, variant: "destructive" });
    },
  });

  const copyMutation = useMutation({
    mutationFn: async (value: string) => {
      const [fromOwnerType, idStr] = value.split(":");
      const res = await apiRequest("POST", `/api/supply-lists/${ownerType}/${ownerId}/copy`, {
        fromOwnerType,
        fromOwnerId: Number(idStr),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to copy supply list");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supply-lists", ownerType, ownerId] });
      setCopyValue("");
      toast({ title: "List copied" });
    },
    onError: (err: Error) => {
      toast({ title: "Could not copy", description: err.message, variant: "destructive" });
    },
  });

  const updateDraft = (key: string, patch: Partial<DraftItem>) => {
    setDrafts((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  if (listQuery.isLoading) {
    return (
      <div className="flex justify-center py-8" data-testid="admin-supply-editor">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (listQuery.error) {
    return (
      <p className="text-sm text-destructive" data-testid="admin-supply-editor">
        Could not load this supply list.
      </p>
    );
  }

  return (
    <div className="space-y-4" data-testid="admin-supply-editor">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between">
        <p className="text-sm text-muted-foreground">
          {ownerLabel
            ? `Items parents need for ${ownerLabel}. Link a shop product (including Amazon affiliates) instead of pasting a URL.`
            : "Items parents need for this class or session. Link a shop product instead of pasting a URL."}
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            data-testid="input-supply-csv-file"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const text = await file.text();
              setCsvFile(file);
              setCsvText(text);
              setCsvOpen(true);
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => csvInputRef.current?.click()}
            data-testid="button-import-supply-csv"
          >
            <Upload className="h-4 w-4 mr-2" />
            Import CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={downloadTemplate}
            data-testid="button-download-supply-csv-template"
          >
            <Download className="h-4 w-4 mr-2" />
            Download template
          </Button>
          {copyOptions.length > 0 && (
            <>
              <Select
                value={copyValue || undefined}
                onValueChange={setCopyValue}
              >
                <SelectTrigger className="w-[220px]" data-testid="select-copy-source">
                  <SelectValue placeholder="Copy from…" />
                </SelectTrigger>
                <SelectContent>
                  {copyOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                disabled={!copyValue || copyMutation.isPending}
                onClick={() => copyValue && copyMutation.mutate(copyValue)}
                data-testid="button-copy-supply-list"
              >
                Copy
              </Button>
            </>
          )}
        </div>
      </div>

      {drafts.length === 0 && (
        <p className="text-sm text-muted-foreground">No items yet. Add what families should buy or bring.</p>
      )}

      <div className="space-y-4">
        {drafts.map((draft, index) => (
          <div
            key={draft.key}
            className="rounded-lg border p-4 space-y-3"
            data-testid={`admin-supply-row-${index}`}
          >
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-3 space-y-1">
                <Label htmlFor={`supply-name-${draft.key}`}>Item</Label>
                <Input
                  id={`supply-name-${draft.key}`}
                  value={draft.name}
                  onChange={(e) => updateDraft(draft.key, { name: e.target.value })}
                  placeholder="Water bottle"
                  data-testid={`input-supply-name-${index}`}
                />
              </div>
              <div className="md:col-span-2 space-y-1">
                <Label htmlFor={`supply-qty-${draft.key}`}>Qty</Label>
                <Input
                  id={`supply-qty-${draft.key}`}
                  type="number"
                  min={1}
                  max={99}
                  inputMode="numeric"
                  value={draft.quantity}
                  onChange={(e) =>
                    updateDraft(draft.key, { quantity: Math.max(1, Number(e.target.value) || 1) })
                  }
                  data-testid={`input-supply-qty-${index}`}
                />
              </div>
              <div className="md:col-span-2 space-y-1">
                <Label htmlFor={`supply-unit-${draft.key}`}>Unit</Label>
                <Input
                  id={`supply-unit-${draft.key}`}
                  value={draft.unit}
                  onChange={(e) => updateDraft(draft.key, { unit: e.target.value })}
                  placeholder="box"
                  data-testid={`input-supply-unit-${index}`}
                />
              </div>
              <div className="md:col-span-3 space-y-1">
                <Label>Who needs it</Label>
                <Select
                  value={draft.scope}
                  onValueChange={(value) => updateDraft(draft.key, { scope: value as SupplyScope })}
                >
                  <SelectTrigger data-testid={`select-supply-scope-${index}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="student">Each student</SelectItem>
                    <SelectItem value="class">Each class</SelectItem>
                    <SelectItem value="family">Each family</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2 flex items-end justify-between gap-2">
                <div className="flex items-center gap-2 pb-2">
                  <Switch
                    id={`supply-required-${draft.key}`}
                    checked={draft.required}
                    onCheckedChange={(checked) => updateDraft(draft.key, { required: checked })}
                    data-testid={`switch-supply-required-${index}`}
                  />
                  <Label htmlFor={`supply-required-${draft.key}`}>Required</Label>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-destructive"
                  aria-label={`Remove ${draft.name || "item"}`}
                  onClick={() => setDrafts((rows) => rows.filter((r) => r.key !== draft.key))}
                  data-testid={`button-remove-supply-${index}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Shop product (optional)</Label>
                {products.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No shop products yet.{" "}
                    <Link href="/school-admin/public-store?tab=products" className="underline text-primary">
                      Add it on Public Store → Products
                    </Link>
                    , then link it here.
                  </p>
                ) : (
                  <Select
                    value={draft.storeProductId != null ? String(draft.storeProductId) : "none"}
                    onValueChange={(value) =>
                      updateDraft(draft.key, {
                        storeProductId: value === "none" ? null : Number(value),
                      })
                    }
                  >
                    <SelectTrigger data-testid={`select-supply-product-${index}`}>
                      <SelectValue placeholder="None — bring from home" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None — bring from home</SelectItem>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={String(product.id)}>
                          {product.name}
                          {product.productKind === "affiliate" ? " (Amazon)" : " (Shop)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {draft.storeProductId != null && (
                  <Badge variant="secondary" className="mt-1">
                    {products.find((p) => p.id === draft.storeProductId)?.productKind === "affiliate"
                      ? "Amazon affiliate"
                      : "Shop"}
                  </Badge>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor={`supply-notes-${draft.key}`}>Notes (optional)</Label>
                <Textarea
                  id={`supply-notes-${draft.key}`}
                  rows={2}
                  value={draft.notes}
                  onChange={(e) => updateDraft(draft.key, { notes: e.target.value })}
                  placeholder="Labeled with first name"
                  data-testid={`input-supply-notes-${index}`}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setDrafts((rows) => [...rows, newDraft()])}
          data-testid="button-add-supply-item"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add item
        </Button>
        <Button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          data-testid="button-save-supply-list"
        >
          {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save list
        </Button>
      </div>

      <SupplyListCsvImportDialog
        open={csvOpen}
        ownerType={ownerType}
        ownerId={ownerId}
        existingItemCount={drafts.filter((d) => d.name.trim().length > 0).length}
        file={csvFile}
        csvText={csvText}
        onClose={() => {
          setCsvOpen(false);
          setCsvFile(null);
          setCsvText(null);
        }}
      />
    </div>
  );
}
