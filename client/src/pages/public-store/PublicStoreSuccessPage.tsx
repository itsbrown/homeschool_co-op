import { useEffect } from "react";
import { useParams, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { clearStoreCart } from "@/lib/store-cart";
import { formatStoreMoney, productDeliverySummary, type StoreProductDelivery } from "@/lib/store-checkout";

type OrderLine = {
  lineId: string;
  title: string;
  listingType: string;
  fulfillment: "paid" | "waitlist";
  quantity: number;
  lineTotalCents: number;
  waitlistPosition?: number | null;
  child?: { firstName: string; lastName: string } | null;
};

type OrderConfirmation = {
  store: { name: string; logo?: string | null; storeSlug: string };
  order: {
    id: number;
    orderNumber: string;
    status: string;
    parentEmail: string;
    parentName?: string | null;
    totalCents: number;
    createdAt: string;
  };
  lines: OrderLine[];
  membershipTotalCents: number;
  productDelivery?: StoreProductDelivery | null;
  documents: { id: number; title: string; fileName: string; downloadUrl?: string }[];
};

export default function PublicStoreSuccessPage() {
  const { schoolSlug = "" } = useParams<{ schoolSlug: string }>();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("token");

  const { data, isLoading, isError } = useQuery<OrderConfirmation>({
    queryKey: ["/api/public/store", schoolSlug, "order", token],
    queryFn: async () => {
      const res = await fetch(`/api/public/store/${schoolSlug}/order/${token}`);
      if (!res.ok) throw new Error("Order not found");
      return res.json();
    },
    enabled: !!token,
  });

  useEffect(() => {
    if (data?.order) {
      clearStoreCart();
    }
  }, [data?.order]);

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="mx-auto max-w-xl space-y-6">
        {isLoading && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Loading your confirmation…
            </CardContent>
          </Card>
        )}

        {isError && (
          <Card>
            <CardContent className="py-10 text-center space-y-4">
              <p>We could not find this order. Check your confirmation link or contact the school.</p>
              <Button asChild variant="outline">
                <Link href={`/store/${schoolSlug}`}>Back to store</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {!isLoading && data && (
          <>
            <div className="flex flex-col items-center text-center gap-3">
              {data.store.logo ? (
                <img
                  src={data.store.logo}
                  alt=""
                  className="h-16 w-16 rounded-full object-cover ring-2 ring-white shadow"
                />
              ) : null}
              <div className="inline-flex items-center gap-2 text-green-700">
                <CheckCircle2 className="h-6 w-6" aria-hidden />
                <span className="font-semibold text-lg">Order confirmed</span>
              </div>
              <p className="text-muted-foreground">{data.store.name}</p>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-xl">Thank you{data.order.parentName ? `, ${data.order.parentName.split(" ")[0]}` : ""}!</CardTitle>
                <p
                  className="text-sm text-muted-foreground font-normal"
                  data-testid="store-success-order"
                >
                  Order #{data.order.orderNumber}
                </p>
              </CardHeader>
              <CardContent className="space-y-5">
                {data.order.status === "paid" && (
                  <p className="text-sm rounded-md bg-green-50 border border-green-100 p-3">
                    Payment received. A confirmation has been sent to{" "}
                    <span className="font-medium">{data.order.parentEmail}</span>.
                  </p>
                )}

                <div>
                  <h3 className="font-medium text-sm mb-2">Order summary</h3>
                  <ul className="divide-y rounded-md border text-sm">
                    {data.lines.map((line) => (
                      <li key={line.lineId} className="flex justify-between gap-3 p-3">
                        <div className="min-w-0">
                          <p className="font-medium">{line.title}</p>
                          {line.child && (
                            <p className="text-muted-foreground text-xs mt-0.5">
                              {line.child.firstName} {line.child.lastName}
                            </p>
                          )}
                          {line.fulfillment === "waitlist" && (
                            <p className="text-amber-700 text-xs mt-0.5">
                              Waitlist{line.waitlistPosition ? ` (#${line.waitlistPosition})` : ""} — no charge
                            </p>
                          )}
                          {line.listingType === "product" && line.quantity > 1 && (
                            <p className="text-muted-foreground text-xs mt-0.5">
                              Qty {line.quantity}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 font-medium">
                          {line.fulfillment === "waitlist"
                            ? "$0.00"
                            : formatStoreMoney(line.lineTotalCents)}
                        </span>
                      </li>
                    ))}
                    {data.membershipTotalCents > 0 && (
                      <li className="flex justify-between gap-3 p-3">
                        <span className="font-medium">Membership</span>
                        <span className="font-medium">{formatStoreMoney(data.membershipTotalCents)}</span>
                      </li>
                    )}
                  </ul>
                  <div className="flex justify-between font-semibold pt-3 text-sm">
                    <span>Total paid</span>
                    <span data-testid="store-success-total">{formatStoreMoney(data.order.totalCents)}</span>
                  </div>
                </div>

                {data.productDelivery && data.lines.some((l) => l.listingType === "product") && (
                  <div
                    className="rounded-md border bg-slate-50 p-3 text-sm"
                    data-testid="store-success-delivery"
                  >
                    <p className="font-medium mb-1">Product delivery</p>
                    <p className="text-muted-foreground">{productDeliverySummary(data.productDelivery)}</p>
                    {data.productDelivery.method === "shipping" && data.productDelivery.shippingAddress && (
                      <p className="text-muted-foreground mt-2 whitespace-pre-line">
                        {data.productDelivery.shippingAddress.line1}
                        {data.productDelivery.shippingAddress.line2
                          ? `\n${data.productDelivery.shippingAddress.line2}`
                          : ""}
                        {`\n${data.productDelivery.shippingAddress.city}, ${data.productDelivery.shippingAddress.state} ${data.productDelivery.shippingAddress.postalCode}`}
                      </p>
                    )}
                  </div>
                )}

                {data.documents.length > 0 && (
                  <div>
                    <h3 className="font-medium text-sm mb-2">Program documents</h3>
                    <ul className="text-sm space-y-2">
                      {data.documents.map((d) => (
                        <li key={d.id}>
                          {d.downloadUrl ? (
                            <a
                              href={d.downloadUrl}
                              className="text-blue-700 underline"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {d.title}
                            </a>
                          ) : (
                            d.title
                          )}
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground mt-2">
                      A copy of these links was also emailed to {data.order.parentEmail}.
                    </p>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <Button asChild className="flex-1">
                    <Link href={`/store/${schoolSlug}`}>Continue shopping</Link>
                  </Button>
                  <Button asChild variant="outline" className="flex-1">
                    <Link href="/login">Sign in to your account</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
