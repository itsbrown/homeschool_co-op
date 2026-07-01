import { Link } from "wouter";
import type { StoreCatalogItem } from "@/lib/store-catalog";

type PublicStoreMemberBannerProps = {
  items: StoreCatalogItem[];
  containerClassName?: string;
};

export function PublicStoreMemberBanner({
  items,
  containerClassName = "max-w-5xl",
}: PublicStoreMemberBannerProps) {
  const hasStoreSessions = items.some((item) => item.listingType === "session");

  return (
    <div className="bg-blue-50 border-b border-blue-100">
      <div
        className={`mx-auto ${containerClassName} px-4 py-3 text-sm flex flex-wrap gap-3 items-center`}
      >
        <span>
          {hasStoreSessions
            ? "You're a member — you can also enroll via the member portal:"
            : "You're a member — you can also manage programs in the member portal:"}
        </span>
        <Link href="/parent/programs" className="text-blue-700 underline">
          My Programs
        </Link>
        {hasStoreSessions && (
          <Link href="/enroll" className="text-blue-700 underline">
            Enroll
          </Link>
        )}
      </div>
    </div>
  );
}
