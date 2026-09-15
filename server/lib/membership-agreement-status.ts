import type { IStorage } from "../storage";
import {
  parentAuthCriteriaFromRequest,
  resolveParentDbUser,
  resolveSchoolIdsForParentSessions,
  type ParentAuthCriteria,
} from "./parent-auth-scope";

export type MembershipAgreementStatusPayload = {
  schoolId: number | null;
  schoolName: string | null;
  hasSigned: boolean;
  currentVersion: string | null;
  latestSignedVersion: string | null;
  signedAt: Date | string | null;
  requiresNewSignature: boolean;
};

export const EMPTY_MEMBERSHIP_AGREEMENT_STATUS: MembershipAgreementStatusPayload = {
  schoolId: null,
  schoolName: null,
  hasSigned: false,
  currentVersion: null,
  latestSignedVersion: null,
  signedAt: null,
  requiresNewSignature: false,
};

export function pickMembershipAgreementStatus(
  statuses: MembershipAgreementStatusPayload[],
): MembershipAgreementStatusPayload {
  return statuses.find((status) => status.requiresNewSignature) ?? statuses[0] ?? EMPTY_MEMBERSHIP_AGREEMENT_STATUS;
}

export async function buildMembershipAgreementStatus(
  storage: IStorage,
  parentUserId: number,
  school: {
    id: number;
    name: string;
    membershipAgreementTemplate: string | null;
    membershipAgreementVersion: string | null;
  },
): Promise<MembershipAgreementStatusPayload> {
  const currentVersion = school.membershipAgreementVersion || "1.0";
  const hasSigned = await storage.hasSignedCurrentAgreement(parentUserId, school.id, currentVersion);
  const latestAgreement = await storage.getLatestMembershipAgreementByParentAndSchool(
    parentUserId,
    school.id,
  );

  return {
    schoolId: school.id,
    schoolName: school.name,
    hasSigned,
    currentVersion,
    latestSignedVersion: latestAgreement?.agreementVersion || null,
    signedAt: latestAgreement?.signedAt || null,
    requiresNewSignature: !hasSigned && school.membershipAgreementTemplate != null,
  };
}

export async function membershipAgreementStatusForParent(
  storage: IStorage,
  criteria: ParentAuthCriteria,
): Promise<{ parentId: number | null; status: MembershipAgreementStatusPayload }> {
  const parent = await resolveParentDbUser(storage, criteria);
  if (!parent) {
    return { parentId: null, status: EMPTY_MEMBERSHIP_AGREEMENT_STATUS };
  }

  const { schoolIds } = await resolveSchoolIdsForParentSessions(storage, criteria);
  const statuses: MembershipAgreementStatusPayload[] = [];
  for (const schoolId of schoolIds) {
    const school = await storage.getSchool(schoolId);
    if (!school) continue;
    statuses.push(await buildMembershipAgreementStatus(storage, parent.id, school));
  }

  return { parentId: parent.id, status: pickMembershipAgreementStatus(statuses) };
}

export { parentAuthCriteriaFromRequest };
