import type { IhipSyllabusDto, IhipSyllabusSubjectRow } from "../lib/build-ihip-syllabus";
import {
  ASA_INK,
  ASA_NAVY,
  ASA_PDF_MARGIN,
  ASA_SLATE,
  beginAsaBrandedPage,
  createAsaBrandedPdf,
  drawAsaTitleBlock,
  finishAsaPdf,
} from "./asa-pdf-brand";
import { IHIP_INSTRUCTOR } from "../../shared/ny-ihip-syllabus";

const CONTENT_W = 612 - ASA_PDF_MARGIN * 2;

function beginDistrictPage(doc: PDFKit.PDFDocument, pageNumber: number): void {
  beginAsaBrandedPage(doc, pageNumber, "district");
}

function ensureSpace(doc: PDFKit.PDFDocument, nextPage: () => number, needed = 80): void {
  if (doc.y > doc.page.height - needed) {
    doc.addPage();
    beginDistrictPage(doc, nextPage());
  }
}

function drawBlankLine(doc: PDFKit.PDFDocument): void {
  const y = doc.y + 10;
  doc
    .strokeColor(ASA_SLATE)
    .lineWidth(0.5)
    .moveTo(ASA_PDF_MARGIN, y)
    .lineTo(ASA_PDF_MARGIN + CONTENT_W, y)
    .stroke();
  doc.y = y + 8;
  doc.x = ASA_PDF_MARGIN;
}

function coverageLabel(row: IhipSyllabusSubjectRow): string {
  if (row.coverage === "home") return "Home";
  if (row.coverage === "both") return "Co-op + home";
  return "Co-op";
}

function writeSubject(doc: PDFKit.PDFDocument, row: IhipSyllabusSubjectRow, nextPage: () => number): void {
  ensureSpace(doc, nextPage, 110);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(ASA_INK).text(row.label);
  doc.font("Helvetica").fontSize(9).fillColor(ASA_NAVY).text(`Coverage: ${coverageLabel(row)}`);
  doc.font("Helvetica").fontSize(10).fillColor(ASA_INK).text(row.syllabus, { width: CONTENT_W });
  doc.moveDown(0.25);

  if (row.coverage === "home") {
    ensureSpace(doc, nextPage, 70);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(ASA_NAVY).text("Curriculum / materials (parent complete)");
    drawBlankLine(doc);
    drawBlankLine(doc);
    doc.moveDown(0.15);
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(ASA_NAVY)
      .text("Plan of instruction / learning objectives (parent complete)");
    drawBlankLine(doc);
    drawBlankLine(doc);
    drawBlankLine(doc);
    doc.moveDown(0.4);
    return;
  }

  ensureSpace(doc, nextPage, 50);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(ASA_NAVY).text("Curriculum / materials");
  doc.font("Helvetica").fontSize(10).fillColor(ASA_INK);
  if (row.curriculum.length) {
    for (const item of row.curriculum) {
      ensureSpace(doc, nextPage, 28);
      doc.text(`• ${item}`, { width: CONTENT_W });
    }
  } else {
    doc.text("None listed in published week plans — parent add textbooks or materials used at home.", {
      width: CONTENT_W,
    });
  }
  doc.moveDown(0.25);

  ensureSpace(doc, nextPage, 50);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(ASA_NAVY).text("Plan of instruction / learning objectives");
  doc.font("Helvetica").fontSize(10).fillColor(ASA_INK);
  if (!row.plan.length) {
    doc.text("No published week titles yet — parent add this year's topics and objectives.", { width: CONTENT_W });
  } else {
    for (const lesson of row.plan) {
      ensureSpace(doc, nextPage, 40);
      const when = lesson.weekStartDate ? ` · ${lesson.weekStartDate}` : "";
      doc.font("Helvetica-Bold").fontSize(10).fillColor(ASA_INK);
      doc.text(`Week ${lesson.weekNumber}${when} · ${lesson.title}`, { width: CONTENT_W });
      doc.font("Helvetica").fontSize(10).fillColor(ASA_INK);
      if (lesson.description) {
        doc.text(lesson.description.replace(/\s+/g, " ").slice(0, 280), { width: CONTENT_W });
      }
      if (lesson.objectives.length) {
        for (const objective of lesson.objectives) {
          ensureSpace(doc, nextPage, 24);
          doc.text(`  • ${objective}`, { width: CONTENT_W });
        }
      }
    }
  }
  doc.moveDown(0.45);
}

export async function generateIhipSyllabusPdf(dto: IhipSyllabusDto): Promise<Buffer> {
  const doc = createAsaBrandedPdf({
    title: `IHIP Plan of Instruction - ${dto.header.studentName}`,
    chrome: "district",
  });

  let pageNumber = 1;
  const nextPage = () => {
    pageNumber += 1;
    return pageNumber;
  };

  beginDistrictPage(doc, pageNumber);
  drawAsaTitleBlock(
    doc,
    "IHIP / Plan of Instruction",
    `${dto.header.studentName}  ·  ${dto.schoolYear}`,
  );

  doc.font("Helvetica").fontSize(10).fillColor(ASA_INK);
  doc.text(`Grade: ${dto.header.gradeLevel || "—"}${dto.header.age ? `  ·  Age: ${dto.header.age}` : ""}`);
  if (dto.header.campus) doc.text(`Campus: ${dto.header.campus}`);
  doc.text(`Instructor of record: ${IHIP_INSTRUCTOR}`);
  doc.text(`Instructional hours: ${dto.header.hourGuidance}`);
  doc.moveDown(0.35);
  doc.font("Helvetica-Bold").text("Enrolled classes");
  doc.font("Helvetica");
  if (!dto.header.classes.length) {
    doc.text("No enrolled classes on file.");
  } else {
    for (const c of dto.header.classes) {
      doc.text(`• ${c.title} — ${c.days} ${c.hours}`);
    }
  }
  doc.moveDown(0.35);
  doc.font("Helvetica-Bold").text("Suggested quarterly report dates");
  doc.font("Helvetica").text(dto.header.quarterlyDates.join("  ·  ") || "—");
  doc.moveDown(0.45);

  doc.font("Helvetica-Bold").fontSize(11).fillColor(ASA_NAVY).text("How to use this packet");
  doc.font("Helvetica").fontSize(10).fillColor(ASA_INK);
  for (const note of dto.filingNotes) {
    doc.text(`• ${note}`, { width: CONTENT_W });
  }
  doc.moveDown(0.5);

  doc.font("Helvetica-Bold").fontSize(12).fillColor(ASA_NAVY).text("Required subjects");
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(ASA_INK)
    .text(
      "For each subject: curriculum materials / textbooks, and this year's plan of instruction (topics and learning objectives).",
      { width: CONTENT_W },
    );
  doc.moveDown(0.35);

  for (const row of dto.subjects) {
    writeSubject(doc, row, nextPage);
  }

  return finishAsaPdf(doc);
}
