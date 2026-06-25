import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Link } from "wouter";

type StorePublishSectionProps = {
  listingType: "session" | "class";
  storeEnabled: boolean;
  publish: boolean;
  membersOnly: boolean;
  onPublishChange: (v: boolean) => void;
  onMembersOnlyChange: (v: boolean) => void;
  defaultMembersOnly?: boolean;
};

export function StorePublishSection({
  storeEnabled,
  publish,
  membersOnly,
  onPublishChange,
  onMembersOnlyChange,
  defaultMembersOnly = false,
}: StorePublishSectionProps) {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <h3 className="font-medium">Public store</h3>
      {!storeEnabled ? (
        <p className="text-sm text-muted-foreground">
          Enable the public store in{" "}
          <Link href="/school-admin/public-store" className="text-blue-700 underline">
            Public Store settings
          </Link>
          .
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Switch checked={publish} onCheckedChange={onPublishChange} />
            <Label>List on public store</Label>
          </div>
          {publish && (
            <div className="flex items-center gap-2 ml-6">
              <Switch
                checked={membersOnly}
                onCheckedChange={onMembersOnlyChange}
                defaultChecked={defaultMembersOnly}
              />
              <Label>Members only</Label>
            </div>
          )}
        </>
      )}
    </div>
  );
}
