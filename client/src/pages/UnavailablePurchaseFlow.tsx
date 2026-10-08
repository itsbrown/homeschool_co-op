import { Link } from "wouter";

/**
 * Placeholder platform and class checkout pages stay in the repo, but they
 * are not mounted. Those screens use fake Stripe price ids and mock class data.
 */
export default function UnavailablePurchaseFlow() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-2xl font-semibold">This checkout is not available</h1>
        <p className="text-muted-foreground">
          Family tuition and memberships are paid from Payments. This page is
          turned off so a placeholder price cannot be charged.
        </p>
        <Link href="/payments" className="text-primary underline">
          Go to Payments
        </Link>
      </div>
    </div>
  );
}
