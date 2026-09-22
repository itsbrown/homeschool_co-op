import PDFDocument from "pdfkit";

/** ASA print brand — matches weekly-schedule sheet (navy + crimson wordmark). */
export const ASA_NAVY = "#004B87";
export const ASA_CRIMSON = "#C02D2E";
export const ASA_SLATE = "#94a3b8";
export const ASA_INK = "#111111";

export const ASA_PDF_AUTHOR = "American Seekers Academy";
export const ASA_WORDMARK_LINE1 = "AMERICAN SEEKERS";
export const ASA_WORDMARK_LINE2 = "Academy";
export const ASA_INSTRUCTOR_FOOTER = "Parent(s) are the instructors of record";

/** Weekly-schedule print keeps the wordmark. District IHIP packets must not name the school. */
export type AsaPdfChrome = "branded" | "district";

export const ASA_PDF_MARGIN = 50;
export const ASA_PDF_CONTENT_TOP = 58;

const PAGE_W = 612;

export function createAsaBrandedPdf(info: { title: string; chrome?: AsaPdfChrome }): PDFKit.PDFDocument {
  const district = info.chrome === "district";
  const doc = new PDFDocument({
    size: "LETTER",
    margin: ASA_PDF_MARGIN,
    info: {
      Title: info.title,
      Author: district ? "Parent(s)" : ASA_PDF_AUTHOR,
    },
  });
  return doc;
}

/** Top-right wordmark; does not move the content cursor. */
export function drawAsaWordmark(doc: PDFKit.PDFDocument): void {
  const width = 170;
  const x = PAGE_W - ASA_PDF_MARGIN - width;
  const y = 26;
  doc.save();
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(ASA_NAVY)
    .text(ASA_WORDMARK_LINE1, x, y, { width, align: "right", lineBreak: false });
  doc
    .font("Times-BoldItalic")
    .fontSize(13)
    .fillColor(ASA_CRIMSON)
    .text(ASA_WORDMARK_LINE2, x, y + 10, { width, align: "right", lineBreak: false });
  doc.restore();
}

export function drawAsaTitleBlock(
  doc: PDFKit.PDFDocument,
  title: string,
  subtitle?: string,
): void {
  doc.y = ASA_PDF_CONTENT_TOP;
  doc
    .font("Times-BoldItalic")
    .fontSize(20)
    .fillColor(ASA_CRIMSON)
    .text(title, ASA_PDF_MARGIN, doc.y, {
      width: PAGE_W - ASA_PDF_MARGIN * 2,
      align: "center",
    });
  if (subtitle?.trim()) {
    doc.moveDown(0.25);
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(ASA_NAVY)
      .text(subtitle.trim(), { align: "center" });
  }
  doc.moveDown(0.35);
  const ruleY = doc.y;
  doc
    .strokeColor(ASA_SLATE)
    .lineWidth(0.75)
    .moveTo(ASA_PDF_MARGIN, ruleY)
    .lineTo(PAGE_W - ASA_PDF_MARGIN, ruleY)
    .stroke();
  doc.moveDown(0.6);
  doc.fillColor(ASA_INK);
}

function drawAsaFooterOnPage(
  doc: PDFKit.PDFDocument,
  pageNumber: number,
  chrome: AsaPdfChrome,
): void {
  const y = doc.page.height - 36;
  const savedBottom = doc.page.margins.bottom;
  const savedX = doc.x;
  const savedY = doc.y;
  // Footer sits in the bottom margin. PDFKit auto-adds a page if text() starts
  // below margins.bottom — that left district PDFs with a blank first page.
  doc.page.margins.bottom = 0;
  const line =
    chrome === "district"
      ? `${ASA_INSTRUCTOR_FOOTER}  ·  ${pageNumber}`
      : `${ASA_PDF_AUTHOR}  ·  ${ASA_INSTRUCTOR_FOOTER}  ·  ${pageNumber}`;
  doc.save();
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#666666")
    .text(line, ASA_PDF_MARGIN, y, {
      width: PAGE_W - ASA_PDF_MARGIN * 2,
      align: "center",
      lineBreak: false,
    });
  doc.restore();
  doc.page.margins.bottom = savedBottom;
  doc.x = savedX;
  doc.y = savedY;
}

/** Paint chrome on the current page and park the cursor below the header. */
export function beginAsaBrandedPage(
  doc: PDFKit.PDFDocument,
  pageNumber = 1,
  chrome: AsaPdfChrome = "branded",
): void {
  if (chrome !== "district") drawAsaWordmark(doc);
  drawAsaFooterOnPage(doc, pageNumber, chrome);
  doc.x = ASA_PDF_MARGIN;
  doc.y = ASA_PDF_CONTENT_TOP;
  doc.fillColor(ASA_INK);
}

export function finishAsaPdf(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

/** Minimal branded one-pager for chrome unit tests. */
export async function generateAsaBrandSamplePdf(): Promise<Buffer> {
  const doc = createAsaBrandedPdf({ title: "ASA Brand Sample" });
  beginAsaBrandedPage(doc);
  drawAsaTitleBlock(doc, "ASA Brand Sample", "District packet chrome");
  doc.font("Helvetica").fontSize(11).fillColor(ASA_INK).text("Sample body for brand tests.", {
    width: PAGE_W - ASA_PDF_MARGIN * 2,
  });
  return finishAsaPdf(doc);
}
