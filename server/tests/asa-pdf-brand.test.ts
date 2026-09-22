import { describe, expect, it } from "@jest/globals";
import {
  ASA_INSTRUCTOR_FOOTER,
  ASA_PDF_AUTHOR,
  ASA_WORDMARK_LINE1,
  ASA_WORDMARK_LINE2,
  beginAsaBrandedPage,
  createAsaBrandedPdf,
  drawAsaTitleBlock,
  finishAsaPdf,
  generateAsaBrandSamplePdf,
} from "../services/asa-pdf-brand";
import { parsePdfText } from "./helpers/parsePdfText";

describe("ASA PDF brand chrome", () => {
  it("stamps the navy/crimson wordmark and instructor footer", async () => {
    const buf = await generateAsaBrandSamplePdf();
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default as (
      data: Buffer,
    ) => Promise<{ text?: string; numpages?: number }>;
    const parsed = await pdfParse(buf);
    expect(parsed.numpages).toBe(1);
    const text = parsed.text || "";
    expect(text).toContain(ASA_WORDMARK_LINE1);
    expect(text).toContain(ASA_WORDMARK_LINE2);
    expect(text).toContain(ASA_INSTRUCTOR_FOOTER);
  });

  it("district chrome omits the school name", async () => {
    const doc = createAsaBrandedPdf({ title: "IHIP / Plan of Instruction", chrome: "district" });
    beginAsaBrandedPage(doc, 1, "district");
    drawAsaTitleBlock(doc, "IHIP / Plan of Instruction");
    doc.font("Helvetica").fontSize(11).text("Sample district body.");
    const buf = await finishAsaPdf(doc);
    const text = await parsePdfText(buf);
    expect(text).toContain(ASA_INSTRUCTOR_FOOTER);
    expect(text).not.toContain(ASA_WORDMARK_LINE1);
    expect(text).not.toContain(ASA_PDF_AUTHOR);
    expect(text).not.toMatch(/American Seekers/i);
  });
});
