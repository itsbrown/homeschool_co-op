/** Defaults when `schools.enabled_features` is empty or a key is unset */
export const DEFAULT_SCHOOL_FEATURES: Record<string, boolean> = {
  financialReports: true,
  aiInsights: true,
};

export function normalizeSchoolFeatures(raw: unknown): Record<string, boolean> {
  const merged: Record<string, boolean> = { ...DEFAULT_SCHOOL_FEATURES };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return merged;
  }
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'boolean') {
      merged[key] = value;
    }
  }
  return merged;
}

export function isSchoolFeatureEnabled(features: Record<string, boolean>, featureName: string): boolean {
  if (Object.prototype.hasOwnProperty.call(features, featureName)) {
    return features[featureName] === true;
  }
  return DEFAULT_SCHOOL_FEATURES[featureName] === true;
}

/** Nav + admin access: paid feature flag or school already activated the store. */
export function showPublicStoreInNav(
  features: Record<string, boolean>,
  publicStoreEnabled: boolean,
): boolean {
  return isSchoolFeatureEnabled(features, 'publicStore') || publicStoreEnabled === true;
}
