/**
 * Stable, deterministic fingerprint of the cart line tuples that affect
 * pricing. Sorts the (classId, childId, variantId, enrollmentId) tuples
 * then joins them so reordering items doesn't change the value but
 * adding / removing / swapping any of those fields does.
 *
 * The client computes this from its cart-items state and sends it alongside
 * a `trustedSnapshotId` to /api/stripe/create-payment-intent. The server
 * computed the same fingerprint when it cached the snapshot in
 * `/api/cart/snapshot`. The trust path is only honoured when both match.
 *
 * Non-cryptographic — fingerprint equality is what matters, not collision
 * resistance. The cache key is also bound to userId + TTL on the server.
 */
export function computeCartItemFingerprint(
  items: Array<{
    classId?: number | string | null;
    childId?: number | string | null;
    variantId?: string | null;
    enrollmentId?: number | null;
  }>,
): string {
  const tuples = items.map((i) =>
    [
      i.classId ?? '',
      i.childId ?? '',
      i.variantId ?? '',
      i.enrollmentId ?? '',
    ].join(':'),
  );
  tuples.sort();
  const joined = tuples.join('|');
  let hash = 0;
  for (let i = 0; i < joined.length; i++) {
    hash = ((hash << 5) - hash + joined.charCodeAt(i)) | 0;
  }
  return `fp_${Math.abs(hash).toString(36)}_${tuples.length}`;
}
