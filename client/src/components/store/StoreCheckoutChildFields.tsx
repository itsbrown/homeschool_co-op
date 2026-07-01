import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  STORE_CHECKOUT_GRADE_LEVELS,
  emptyChildDraft,
  type StoreChildDraft,
} from "@/lib/store-checkout";

type ChildOption = { id: number; firstName: string; lastName: string };

type StoreCheckoutChildFieldsProps = {
  lineId: string;
  programTitle: string;
  isAuthenticated: boolean;
  children: ChildOption[];
  assignment?: { childId?: number; draft?: StoreChildDraft };
  onChange: (lineId: string, value: { childId?: number; draft?: StoreChildDraft }) => void;
  showCopyHint?: boolean;
  onCopyToAll?: () => void;
};

export function StoreCheckoutChildFields({
  lineId,
  programTitle,
  isAuthenticated,
  children,
  assignment,
  onChange,
  showCopyHint,
  onCopyToAll,
}: StoreCheckoutChildFieldsProps) {
  const draft = assignment?.draft ?? emptyChildDraft();
  const usingSavedChild = isAuthenticated && children.length > 0 && assignment?.childId;

  const updateDraft = (patch: Partial<StoreChildDraft>) => {
    onChange(lineId, {
      ...assignment,
      childId: undefined,
      draft: { ...draft, ...patch },
    });
  };

  return (
    <div className="border rounded-lg p-4 space-y-4" data-testid={`store-checkout-child-block-${lineId}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{programTitle}</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Who will attend this program?
          </p>
        </div>
        {showCopyHint && onCopyToAll && (
          <button
            type="button"
            className="text-xs text-blue-700 underline shrink-0"
            onClick={onCopyToAll}
            data-testid="store-checkout-copy-child-to-all"
          >
            Use same child for all
          </button>
        )}
      </div>

      {isAuthenticated && children.length > 0 ? (
        <div className="space-y-3">
          <div>
            <Label htmlFor={`child-select-${lineId}`}>Registered child</Label>
            <Select
              value={assignment?.childId?.toString() ?? ""}
              onValueChange={(v) => {
                if (v === "new") {
                  onChange(lineId, { draft: emptyChildDraft() });
                  return;
                }
                onChange(lineId, { childId: parseInt(v, 10) });
              }}
            >
              <SelectTrigger id={`child-select-${lineId}`} data-testid="store-checkout-child-select">
                <SelectValue placeholder="Select a child" />
              </SelectTrigger>
              <SelectContent>
                {children.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.firstName} {c.lastName}
                  </SelectItem>
                ))}
                <SelectItem value="new">Add a new child</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {!usingSavedChild && (
            <GuestChildDraftFields draft={draft} onChange={updateDraft} />
          )}
        </div>
      ) : (
        <GuestChildDraftFields draft={draft} onChange={updateDraft} />
      )}
    </div>
  );
}

function GuestChildDraftFields({
  draft,
  onChange,
}: {
  draft: StoreChildDraft;
  onChange: (patch: Partial<StoreChildDraft>) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <Label htmlFor="store-checkout-child-first-name">First name</Label>
        <Input
          id="store-checkout-child-first-name"
          value={draft.firstName}
          onChange={(e) => onChange({ firstName: e.target.value })}
          autoComplete="given-name"
          data-testid="store-checkout-child-first-name"
        />
      </div>
      <div>
        <Label htmlFor="store-checkout-child-last-name">Last name</Label>
        <Input
          id="store-checkout-child-last-name"
          value={draft.lastName}
          onChange={(e) => onChange({ lastName: e.target.value })}
          autoComplete="family-name"
          data-testid="store-checkout-child-last-name"
        />
      </div>
      <div>
        <Label htmlFor="store-checkout-child-birthdate">Date of birth</Label>
        <Input
          id="store-checkout-child-birthdate"
          type="date"
          value={draft.birthdate}
          onChange={(e) => onChange({ birthdate: e.target.value })}
          data-testid="store-checkout-child-birthdate"
        />
      </div>
      <div>
        <Label htmlFor="store-checkout-child-grade">Grade level</Label>
        <Select value={draft.gradeLevel} onValueChange={(v) => onChange({ gradeLevel: v })}>
          <SelectTrigger id="store-checkout-child-grade" data-testid="store-checkout-child-grade">
            <SelectValue placeholder="Select grade" />
          </SelectTrigger>
          <SelectContent>
            {STORE_CHECKOUT_GRADE_LEVELS.map((grade) => (
              <SelectItem key={grade} value={grade}>
                {grade}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
