import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { ShieldAlert } from 'lucide-react';

/**
 * Shown when SchoolRouteGuard blocks a deep link without permission.
 */
export default function ForbiddenPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center bg-gray-50 px-4"
      data-testid="forbidden-page"
    >
      <div className="max-w-md text-center space-y-4">
        <ShieldAlert className="h-12 w-12 text-amber-600 mx-auto" aria-hidden />
        <h1 className="text-2xl font-semibold text-gray-900">Access denied</h1>
        <p className="text-gray-600">
          You do not have permission to view this section. Contact your school administrator if you
          need access.
        </p>
        <div className="flex gap-3 justify-center">
          <Link href="/dashboard">
            <Button data-testid="forbidden-back-dashboard">Back to dashboard</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
