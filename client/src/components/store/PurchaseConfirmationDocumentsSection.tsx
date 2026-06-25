import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Doc = { id: number; title: string };

type PurchaseConfirmationDocumentsProps = {
  documents: Doc[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
};

export function PurchaseConfirmationDocumentsSection({
  documents,
  selectedIds,
  onChange,
}: PurchaseConfirmationDocumentsProps) {
  const toggle = (id: number) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <h3 className="font-medium">Purchase confirmation documents</h3>
      <p className="text-sm text-muted-foreground">
        Attached to the store purchase confirmation email (paid lines only).
      </p>
      <div className="space-y-2">
        {documents.map((doc) => (
          <label key={doc.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selectedIds.includes(doc.id)}
              onChange={() => toggle(doc.id)}
            />
            {doc.title}
          </label>
        ))}
        {documents.length === 0 && (
          <p className="text-sm text-muted-foreground">No school documents uploaded yet.</p>
        )}
      </div>
    </div>
  );
}
