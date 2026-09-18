export const PARENT_DOCUMENTS_PATH = "/parent/documents";
export const PARENT_DOCUMENTS_NAV_LABEL = "Important Documents";
export const PARENT_DOCUMENTS_SCHOOL_HREF = `${PARENT_DOCUMENTS_PATH}?tab=school-documents`;

export type ParentDocumentsTab = "agreements" | "school-documents" | "receipts";

const TABS = new Set<ParentDocumentsTab>(["agreements", "school-documents", "receipts"]);

/** Staff and emails say Important Documents; school PDFs live on the School Documents tab. */
export function parseParentDocumentsTab(search: string | undefined | null): ParentDocumentsTab {
  const raw = (search ?? "").replace(/^\?/, "");
  const tab = new URLSearchParams(raw).get("tab");
  if (tab && TABS.has(tab as ParentDocumentsTab)) {
    return tab as ParentDocumentsTab;
  }
  if (tab === "school" || tab === "important" || tab === "documents") {
    return "school-documents";
  }
  return "school-documents";
}

export function parentDocumentsHref(tab: ParentDocumentsTab = "school-documents"): string {
  return `${PARENT_DOCUMENTS_PATH}?tab=${tab}`;
}
