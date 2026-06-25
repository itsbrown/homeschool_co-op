import { useParams, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function PublicStoreSuccessPage() {
  const { schoolSlug = "" } = useParams<{ schoolSlug: string }>();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("token");

  const { data, isLoading } = useQuery({
    queryKey: ["/api/public/store", schoolSlug, "order", token],
    queryFn: async () => {
      const res = await fetch(`/api/public/store/${schoolSlug}/order/${token}`);
      if (!res.ok) throw new Error("Order not found");
      return res.json();
    },
    enabled: !!token,
  });

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle>Thank you!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading && <p>Loading your confirmation…</p>}
          {!isLoading && data && (
            <>
              <p>Your order #{data.order.id} has been received.</p>
              {data.order.status === "paid" && (
                <p className="text-sm text-muted-foreground">
                  A confirmation email has been sent to {data.order.parentEmail}.
                </p>
              )}
              {data.documents?.length > 0 && (
                <div>
                  <p className="font-medium text-sm mb-2">Documents</p>
                  <ul className="text-sm list-disc pl-5">
                    {data.documents.map((d: { id: number; title: string }) => (
                      <li key={d.id}>{d.title}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
          <Button asChild variant="outline">
            <Link href={`/store/${schoolSlug}`}>Back to store</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
