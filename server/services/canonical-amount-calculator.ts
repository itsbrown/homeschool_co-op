/**
 * Canonical amount calculator contract for checkout + billing charge computation.
 *
 * - Pure and deterministic: same input -> same output.
 * - Integer cents only end-to-end.
 * - Caller-provided aggregate totals are treated as untrusted and never used to compute totals.
 */
import { parseOptionalIntegerCents } from "./cents-utils";

export type AmountCalculationMode = "checkout" | "billing";

export interface CanonicalAmountLineInput {
  id: string;
  totalCostCents?: unknown;
  totalPaidCents?: unknown;
  remainingBalanceCents?: unknown;
}

export interface CanonicalAmountCalculationRequest {
  mode: AmountCalculationMode;
  items: CanonicalAmountLineInput[];
  membershipAmountCents?: unknown;
  clientProvidedTotalAmountCents?: unknown;
}

export interface CanonicalAmountLineBreakdown {
  id: string;
  totalCostCents: number;
  totalPaidCents: number;
  computedRemainingBalanceCents: number;
  selectedChargeCents: number;
  source: "total_cost" | "remaining_balance";
  mismatch: {
    providedRemainingBalanceCents: number | null;
    remainingBalanceMismatchCents: number;
  };
  flags: {
    invalidTotalCost: boolean;
    invalidTotalPaid: boolean;
    invalidRemainingBalance: boolean;
    usedProvidedRemainingBalance: boolean;
    overpaidAgainstTotalCost: boolean;
  };
}

export interface CanonicalAmountValidation {
  isValid: boolean;
  hasWarnings: boolean;
  errors: string[];
  warnings: string[];
}

export interface CanonicalAmountCalculationResult {
  mode: AmountCalculationMode;
  lineCount: number;
  enrollmentSubtotalCents: number;
  membershipAmountCents: number;
  totalAmountCents: number;
  breakdown: CanonicalAmountLineBreakdown[];
  mismatch: {
    clientProvidedTotalAmountCents: number | null;
    clientTotalMismatchCents: number;
    hadClientTotalMismatch: boolean;
  };
  validation: CanonicalAmountValidation;
}

function parseNonNegativeIntegerCents(
  value: unknown,
  field: string,
  errors: string[],
  lineId?: string,
): { value: number; invalid: boolean } {
  const parsed = parseOptionalIntegerCents(value);
  if (parsed.value === null && !parsed.malformed) {
    return { value: 0, invalid: false };
  }

  if (parsed.malformed) {
    if (typeof value === "string" && !/^-?\d+$/.test(value.trim())) {
      errors.push(`${lineId ? `Line "${lineId}"` : field} has malformed ${field}`);
      return { value: 0, invalid: true };
    }
    errors.push(`${lineId ? `Line "${lineId}"` : field} has non-integer ${field}`);
    return { value: 0, invalid: true };
  }

  if ((parsed.value as number) < 0) {
    errors.push(`${lineId ? `Line "${lineId}"` : field} has negative ${field}`);
    return { value: 0, invalid: true };
  }

  return { value: parsed.value as number, invalid: false };
}

export function calculateCanonicalAmounts(
  request: CanonicalAmountCalculationRequest,
): CanonicalAmountCalculationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const breakdown: CanonicalAmountLineBreakdown[] = [];
  const seenIds = new Set<string>();

  if (!request || !Array.isArray(request.items)) {
    return {
      mode: request?.mode ?? "billing",
      lineCount: 0,
      enrollmentSubtotalCents: 0,
      membershipAmountCents: 0,
      totalAmountCents: 0,
      breakdown: [],
      mismatch: {
        clientProvidedTotalAmountCents: null,
        clientTotalMismatchCents: 0,
        hadClientTotalMismatch: false,
      },
      validation: {
        isValid: false,
        hasWarnings: false,
        errors: ["Invalid request: items must be an array"],
        warnings: [],
      },
    };
  }

  const parsedMembership = parseNonNegativeIntegerCents(
    request.membershipAmountCents,
    "membershipAmountCents",
    errors,
  );

  for (const line of request.items) {
    if (!line || typeof line.id !== "string" || line.id.trim().length === 0) {
      errors.push("Each item must have a non-empty string id");
      continue;
    }

    if (seenIds.has(line.id)) {
      errors.push(`Duplicate line id "${line.id}"`);
      continue;
    }
    seenIds.add(line.id);

    const totalCost = parseNonNegativeIntegerCents(
      line.totalCostCents,
      "totalCostCents",
      errors,
      line.id,
    );
    const totalPaid = parseNonNegativeIntegerCents(
      line.totalPaidCents,
      "totalPaidCents",
      errors,
      line.id,
    );
    const providedRemaining = parseNonNegativeIntegerCents(
      line.remainingBalanceCents,
      "remainingBalanceCents",
      errors,
      line.id,
    );

    const computedRemainingBalanceCents = Math.max(0, totalCost.value - totalPaid.value);
    const overpaidAgainstTotalCost = totalPaid.value > totalCost.value;
    if (overpaidAgainstTotalCost) {
      warnings.push(`Line "${line.id}" has totalPaidCents greater than totalCostCents`);
    }

    const hasProvidedRemaining =
      line.remainingBalanceCents !== null &&
      line.remainingBalanceCents !== undefined &&
      line.remainingBalanceCents !== "";
    const canUseProvidedRemaining = request.mode === "billing" && hasProvidedRemaining && !providedRemaining.invalid;
    const selectedChargeCents = canUseProvidedRemaining
      ? providedRemaining.value
      : request.mode === "checkout"
        ? totalCost.value
        : computedRemainingBalanceCents;

    const remainingBalanceMismatchCents =
      canUseProvidedRemaining
        ? providedRemaining.value - computedRemainingBalanceCents
        : 0;

    if (canUseProvidedRemaining && remainingBalanceMismatchCents !== 0) {
      warnings.push(
        `Line "${line.id}" provided remainingBalanceCents differs from computed balance`,
      );
    }

    breakdown.push({
      id: line.id,
      totalCostCents: totalCost.value,
      totalPaidCents: totalPaid.value,
      computedRemainingBalanceCents,
      selectedChargeCents,
      source: request.mode === "checkout" ? "total_cost" : "remaining_balance",
      mismatch: {
        providedRemainingBalanceCents: hasProvidedRemaining && !providedRemaining.invalid
          ? providedRemaining.value
          : null,
        remainingBalanceMismatchCents,
      },
      flags: {
        invalidTotalCost: totalCost.invalid,
        invalidTotalPaid: totalPaid.invalid,
        invalidRemainingBalance: providedRemaining.invalid,
        usedProvidedRemainingBalance: canUseProvidedRemaining,
        overpaidAgainstTotalCost,
      },
    });
  }

  const enrollmentSubtotalCents = breakdown.reduce(
    (sum, line) => sum + line.selectedChargeCents,
    0,
  );
  const membershipAmountCents = parsedMembership.value;
  const totalAmountCents = enrollmentSubtotalCents + membershipAmountCents;

  const parsedClientTotal = parseOptionalIntegerCents(request.clientProvidedTotalAmountCents);
  if (parsedClientTotal.malformed) {
    warnings.push("Client-provided total is malformed and was ignored");
  }
  const clientProvidedTotalAmountCents =
    request.clientProvidedTotalAmountCents === null ||
    request.clientProvidedTotalAmountCents === undefined ||
    request.clientProvidedTotalAmountCents === "" ||
    parsedClientTotal.malformed
      ? null
      : (parsedClientTotal.value as number);

  const clientTotalMismatchCents =
    clientProvidedTotalAmountCents === null
      ? 0
      : clientProvidedTotalAmountCents - totalAmountCents;
  const hadClientTotalMismatch = clientTotalMismatchCents !== 0;

  if (hadClientTotalMismatch) {
    warnings.push("Client-provided total differs from canonical server-computed total");
  }

  return {
    mode: request.mode,
    lineCount: breakdown.length,
    enrollmentSubtotalCents,
    membershipAmountCents,
    totalAmountCents,
    breakdown,
    mismatch: {
      clientProvidedTotalAmountCents,
      clientTotalMismatchCents,
      hadClientTotalMismatch,
    },
    validation: {
      isValid: errors.length === 0,
      hasWarnings: warnings.length > 0,
      errors,
      warnings,
    },
  };
}
