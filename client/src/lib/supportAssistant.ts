export type SupportIssueCategory = 'platform' | 'school_policy';

export const SUPPORT_ASSISTANT_OPEN_EVENT = 'asa:open-support-assistant';

export interface OpenSupportAssistantDetail {
  initialIssue?: string;
  issueCategory?: SupportIssueCategory;
}

export function openSupportAssistant(detail?: OpenSupportAssistantDetail) {
  window.dispatchEvent(
    new CustomEvent(SUPPORT_ASSISTANT_OPEN_EVENT, { detail: detail ?? {} }),
  );
}
