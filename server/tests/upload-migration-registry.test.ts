import { describe, it, expect } from "@jest/globals";
import { uploadCategories } from "../services/fileUploadService";

/**
 * Each migrated upload surface must map to a unified-upload category.
 * CSV-only imports and OCR temp files are intentionally excluded.
 */
const MIGRATED_UPLOAD_SURFACES: Record<string, keyof typeof uploadCategories> = {
  "school logo": "logos",
  "school documents": "documents",
  "knowledge base files": "knowledgeBase",
  "fundraiser product images": "fundraiserProducts",
  "public store programs": "storePrograms",
  "public store merch": "storeProducts",
  "custom form attachments": "formAttachments",
  "waiver signatures": "signatures",
  "support screenshots": "supportScreenshots",
  "product order photos": "productOrderImages",
  "schedule lesson resources": "scheduleResources",
};

describe("upload migration registry", () => {
  it("maps every migrated surface to a configured category", () => {
    for (const [label, category] of Object.entries(MIGRATED_UPLOAD_SURFACES)) {
      expect(uploadCategories[category]).toBeDefined();
      expect(uploadCategories[category].folder).toBeTruthy();
    }
  });
});
