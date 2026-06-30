import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ImageUpload } from "@/components/ImageUpload";
import { ExternalLink, AlertCircle } from "lucide-react";

export type StoreProgram = {
  listingType: "session" | "class";
  sourceId: number;
  title: string;
  description: string | null;
  category: string | null;
  startDate: string | null;
  endDate: string | null;
  priceCents: number | null;
  halfDayPrice: number | null;
  fullDayPrice: number | null;
  coverImage: string | null;
  readyForStore: boolean;
  readyHint: string | null;
  editPath: string;
  storeListing: {
    listingId: number | null;
    isPublished: boolean;
    membersOnly: boolean;
  };
};

const PROGRAMS_QUERY_KEY = ["/api/school-admin/public-store/programs"];

function formatPrice(program: StoreProgram): string {
  if (program.listingType === "class" && program.priceCents != null) {
    return `$${(program.priceCents / 100).toFixed(2)}`;
  }
  const parts: string[] = [];
  if (program.halfDayPrice != null) parts.push(`Half $${(program.halfDayPrice / 100).toFixed(2)}`);
  if (program.fullDayPrice != null) parts.push(`Full $${(program.fullDayPrice / 100).toFixed(2)}`);
  return parts.length ? parts.join(" · ") : "—";
}

type StoreProgramsTabProps = {
  storeEnabled: boolean;
};

export function StoreProgramsTab({ storeEnabled }: StoreProgramsTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "session" | "class">("all");

  const { data, isLoading } = useQuery<{ programs: StoreProgram[] }>({
    queryKey: PROGRAMS_QUERY_KEY,
  });

  const programs = data?.programs ?? [];

  const filtered = useMemo(() => {
    if (filter === "all") return programs;
    return programs.filter((p) => p.listingType === filter);
  }, [programs, filter]);

  const patchProgram = useMutation({
    mutationFn: async (params: {
      listingType: "session" | "class";
      sourceId: number;
      isPublished?: boolean;
      membersOnly?: boolean;
      coverImage?: string | null;
    }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/school-admin/public-store/programs/${params.listingType}/${params.sourceId}`,
        {
          isPublished: params.isPublished,
          membersOnly: params.membersOnly,
          coverImage: params.coverImage,
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Update failed");
      }
      return res.json() as Promise<StoreProgram>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROGRAMS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["/api/school-admin/public-store/listings"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const onTogglePublished = (program: StoreProgram, publish: boolean) => {
    if (publish && !program.readyForStore) {
      toast({
        title: "Not ready for the store",
        description: program.readyHint ?? "Complete setup in Sessions or Classes first.",
        variant: "destructive",
      });
      return;
    }
    patchProgram.mutate({
      listingType: program.listingType,
      sourceId: program.sourceId,
      isPublished: publish,
      membersOnly: program.storeListing.membersOnly,
    });
  };

  const onToggleMembersOnly = (program: StoreProgram, membersOnly: boolean) => {
    patchProgram.mutate({
      listingType: program.listingType,
      sourceId: program.sourceId,
      isPublished: program.storeListing.isPublished,
      membersOnly,
    });
  };

  const onImageChange = (program: StoreProgram, coverImage: string) => {
    patchProgram.mutate(
      {
        listingType: program.listingType,
        sourceId: program.sourceId,
        coverImage: coverImage || null,
      },
      {
        onSuccess: () => toast({ title: "Store image saved" }),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Classes &amp; programs</CardTitle>
        <CardDescription>
          Choose what appears on your public store. Edit program details in Sessions or Classes; control
          storefront visibility here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!storeEnabled && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            Enable the public store in Settings before families can browse listings.
          </p>
        )}

        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="session">Sessions</TabsTrigger>
            <TabsTrigger value="class">Classes</TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading programs…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No sessions or classes yet. Create them under{" "}
            <Link href="/schools/sessions" className="text-blue-700 underline">
              Sessions
            </Link>{" "}
            or{" "}
            <Link href="/schools/classes" className="text-blue-700 underline">
              Classes
            </Link>
            .
          </p>
        ) : (
          <ul className="space-y-4">
            {filtered.map((program) => (
              <li
                key={`${program.listingType}-${program.sourceId}`}
                className="rounded-lg border p-4 space-y-3"
                data-testid={`store-program-${program.listingType}-${program.sourceId}`}
              >
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="w-full sm:w-36 shrink-0">
                    <Label className="text-xs text-muted-foreground mb-1 block">Store image</Label>
                    <ImageUpload
                      value={program.coverImage ?? ""}
                      onChange={(url) => onImageChange(program, url)}
                      uploadEndpoint="/api/school-admin/public-store/upload/program-image"
                      previewAspectClass="aspect-square"
                      disabled={patchProgram.isPending}
                    />
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap items-start gap-2 justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-medium">{program.title}</h3>
                          <Badge variant="outline">
                            {program.listingType === "session" ? "Session" : "Class"}
                          </Badge>
                          {program.category && (
                            <Badge variant="secondary">{program.category}</Badge>
                          )}
                          {program.storeListing.isPublished && (
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                              On store
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{formatPrice(program)}</p>
                      </div>
                      <Button variant="ghost" size="sm" asChild className="shrink-0">
                        <Link href={program.editPath}>
                          Edit details
                          <ExternalLink className="h-3.5 w-3.5 ml-1" />
                        </Link>
                      </Button>
                    </div>

                    {!program.readyForStore && (
                      <p className="text-sm text-amber-700 flex items-start gap-1.5">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        {program.readyHint}
                      </p>
                    )}

                    <div className="flex flex-col gap-2 pt-1">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={program.storeListing.isPublished}
                          onCheckedChange={(v) => onTogglePublished(program, v)}
                          disabled={!storeEnabled || patchProgram.isPending}
                          data-testid={`store-program-publish-${program.listingType}-${program.sourceId}`}
                        />
                        <Label>List on public store</Label>
                      </div>
                      {program.storeListing.isPublished && (
                        <div className="flex items-center gap-2 ml-6">
                          <Switch
                            checked={program.storeListing.membersOnly}
                            onCheckedChange={(v) => onToggleMembersOnly(program, v)}
                            disabled={patchProgram.isPending}
                          />
                          <Label>Members only</Label>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
