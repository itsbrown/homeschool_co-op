import {
  PARENT_DOCUMENTS_NAV_LABEL,
  PARENT_DOCUMENTS_SCHOOL_HREF,
  parentDocumentsHref,
  parseParentDocumentsTab,
} from "../parent-documents";

describe("parent Important Documents tabs", () => {
  it("defaults to school documents so handbooks are not hidden behind Agreements", () => {
    expect(parseParentDocumentsTab(undefined)).toBe("school-documents");
    expect(parseParentDocumentsTab("")).toBe("school-documents");
    expect(parseParentDocumentsTab("foo=bar")).toBe("school-documents");
  });

  it("accepts explicit tabs and staff aliases", () => {
    expect(parseParentDocumentsTab("tab=agreements")).toBe("agreements");
    expect(parseParentDocumentsTab("?tab=receipts")).toBe("receipts");
    expect(parseParentDocumentsTab("tab=school-documents")).toBe("school-documents");
    expect(parseParentDocumentsTab("tab=school")).toBe("school-documents");
    expect(parseParentDocumentsTab("tab=important")).toBe("school-documents");
  });

  it("uses the Important Documents label and school-docs deep link", () => {
    expect(PARENT_DOCUMENTS_NAV_LABEL).toBe("Important Documents");
    expect(PARENT_DOCUMENTS_SCHOOL_HREF).toBe("/parent/documents?tab=school-documents");
    expect(parentDocumentsHref("agreements")).toBe("/parent/documents?tab=agreements");
  });
});
