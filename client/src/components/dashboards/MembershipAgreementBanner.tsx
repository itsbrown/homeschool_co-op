import { Link } from "wouter";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import {
  membershipAgreementBannerCopy,
  membershipAgreementSignHref,
  shouldShowMembershipAgreementBanner,
  type ParentMembershipAgreementStatus,
} from "@/lib/parent-membership-agreement";

export function MembershipAgreementBanner({
  status,
}: {
  status: ParentMembershipAgreementStatus | undefined;
}) {
  if (!shouldShowMembershipAgreementBanner(status) || status?.schoolId == null) {
    return null;
  }

  const copy = membershipAgreementBannerCopy(status);

  return (
    <Alert
      className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-50"
      data-testid="dashboard-membership-agreement"
      role="status"
      aria-live="polite"
    >
      <FileText className="h-4 w-4" />
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <span>{copy.body}</span>
        <Button
          size="sm"
          className="h-11 w-full shrink-0 sm:w-auto"
          asChild
          data-testid="dashboard-membership-agreement-sign"
        >
          <Link href={membershipAgreementSignHref(status.schoolId)}>
            {copy.cta}
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
