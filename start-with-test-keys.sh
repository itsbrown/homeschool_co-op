#!/bin/bash
# Start the dev server with Stripe test keys already present in the environment.
# Do not commit key values. Live secret keys are refused.
set -euo pipefail

if [ -z "${STRIPE_SECRET_KEY:-}" ] || [ -z "${STRIPE_PUBLISHABLE_KEY:-}" ] || [ -z "${VITE_STRIPE_PUBLIC_KEY:-}" ]; then
  echo "Refusing to start. Export STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, and VITE_STRIPE_PUBLIC_KEY (test mode only)." >&2
  exit 1
fi

case "$STRIPE_SECRET_KEY" in
  sk_live_*)
    echo "Refusing to start with a live Stripe secret key." >&2
    exit 1
    ;;
esac

echo "Stripe test keys are set in the environment (values not printed)."
NODE_ENV=development tsx server/index.ts
