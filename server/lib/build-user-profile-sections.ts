/**
 * Unified user profile section builders.
 * Parent financial/enrollment aggregation remains in parent-profile.ts;
 * this module centralizes capability checks shared by profile routes.
 */
export {
  assertAdminCanViewUserProfile,
  deriveCapabilitiesFromLabels,
  type UserProfileCapabilities,
} from './user-profile-capabilities';
