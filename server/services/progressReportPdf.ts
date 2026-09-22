import type { StudentProgressReportDto } from '../lib/build-student-progress-report';
import { IHIP_GUIDE } from '../data/ny-ihip-progress-report-template';
import {
  ASA_INK,
  ASA_PDF_MARGIN,
  beginAsaBrandedPage,
  createAsaBrandedPdf,
  drawAsaTitleBlock,
  finishAsaPdf,
} from './asa-pdf-brand';

function beginDistrictPage(doc: PDFKit.PDFDocument, pageNumber: number): void {
  beginAsaBrandedPage(doc, pageNumber, 'district');
}

const FONT = 'Helvetica';
const BOLD = 'Helvetica-Bold';
const CONTENT_W = 612 - ASA_PDF_MARGIN * 2;

function checkMark(status: string | undefined): string {
  if (status === 'consistent') return '☑';
  if (status === 'na') return 'N/A';
  return '☐';
}

function renderGuidePage(doc: PDFKit.PDFDocument, pageNumber: number): void {
  beginDistrictPage(doc, pageNumber);
  drawAsaTitleBlock(doc, IHIP_GUIDE.title, IHIP_GUIDE.subtitle);
  for (const section of IHIP_GUIDE.sections) {
    doc.font(BOLD).fontSize(11).fillColor(ASA_INK).text(section.heading);
    doc.font(FONT).fontSize(10);
    for (const p of section.paragraphs || []) {
      doc.text(p, { width: CONTENT_W });
      doc.moveDown(0.3);
    }
    for (const b of section.bullets || []) {
      doc.text(`• ${b}`, { width: CONTENT_W, indent: 12 });
    }
    doc.moveDown(0.5);
  }
  doc.fontSize(9).fillColor('#666').text(IHIP_GUIDE.footer, { width: CONTENT_W, align: 'center' });
  doc.fillColor(ASA_INK);
}

function renderHeader(doc: PDFKit.PDFDocument, report: StudentProgressReportDto, pageNumber: number): void {
  const h = report.header;
  beginDistrictPage(doc, pageNumber);
  drawAsaTitleBlock(
    doc,
    'Learning Progress Notes',
    'For NY Homeschool IHIP & Quarterly Reporting',
  );
  doc.font(FONT).fontSize(10).fillColor(ASA_INK);
  doc.text(`${report.bandTemplate.band.toUpperCase()} band · ${report.quarter} ${report.schoolYear}`);
  doc.moveDown(0.5);
  doc.text(`Student Name: ${h.studentName}`);
  doc.text(`Mentor / Instructor: ${h.mentorInstructor}`);
  doc.text(`Quarter / Dates: ${h.quarterDates}`);
  doc.text(`Total Hours This Quarter: ${h.totalHours}`);
  doc.moveDown(0.3);
  doc.font(BOLD).text('Key Material Covered This Quarter (brief):');
  doc.font(FONT).text(h.keyMaterialCovered || ' ', { width: CONTENT_W });
  doc.moveDown(0.5);
}

function renderSection(
  doc: PDFKit.PDFDocument,
  report: StudentProgressReportDto,
  section: (typeof report.bandTemplate.sections)[0],
  nextPage: () => number,
): void {
  if (doc.y > doc.page.height - 120) {
    doc.addPage();
    beginDistrictPage(doc, nextPage());
  }

  doc.font(BOLD).fontSize(10).fillColor(ASA_INK).text(section.title, { width: CONTENT_W });
  doc.font(FONT).fontSize(9);
  if (section.instructions) {
    doc.text(section.instructions, { width: CONTENT_W });
    doc.moveDown(0.2);
  }
  for (const line of section.staticLines || []) {
    let text = line;
    if (section.key === 'math' && report.populated.mathLevelLabel) {
      text = text.replace('Current Level:', `Current Level: ${report.populated.mathLevelLabel}`);
    }
    if (section.key === 'other_core' && report.populated.otherCoreSubjects) {
      doc.text(`Key topics or units covered this quarter: ${report.populated.otherCoreSubjects}`, {
        width: CONTENT_W,
      });
      continue;
    }
    doc.text(text, { width: CONTENT_W });
  }
  if (section.key === 'notes' && report.populated.otherCoreSubjects === undefined) {
    const notes =
      (report.raw as any).metaNotes ||
      report.header.keyMaterialCovered;
    doc.text(notes || ' ', { width: CONTENT_W });
  }

  for (const skill of section.skills || []) {
    if (doc.y > doc.page.height - 60) {
      doc.addPage();
      beginDistrictPage(doc, nextPage());
    }
    const cols = skill.columns || [];
    if (skill.key === 'lit_phonograms') {
      const display = report.populated.phonogramDisplay || '___/___';
      const row = cols.length
        ? cols.map((t) => `${t[0].toUpperCase() + t.slice(1)}: ${display}`).join('   ')
        : `Phonograms ${display}`;
      doc.text(`${skill.label} — ${row}`, { width: CONTENT_W });
      continue;
    }
    if (skill.key === 'lit_reading_level') {
      const rl = [report.populated.readingLevel, report.populated.lexile].filter(Boolean).join(' · ');
      doc.text(`${skill.label}: ${rl || '_______________'}`, { width: CONTENT_W });
      continue;
    }
    if (cols.length) {
      const marks = cols
        .map((t) => `${t[0].toUpperCase() + t.slice(1)} ${checkMark(report.skillChecks[skill.key]?.[t])}`)
        .join('  ');
      doc.text(`${skill.label}  ${marks}`, { width: CONTENT_W });
    } else {
      doc.text(skill.label, { width: CONTENT_W });
    }
  }
  doc.moveDown(0.4);
}

export async function generateProgressReportPdf(
  report: StudentProgressReportDto,
  options?: { includeGuide?: boolean },
): Promise<Buffer> {
  const doc = createAsaBrandedPdf({
    title: `Learning Progress Notes - ${report.header.studentName}`,
    chrome: 'district',
  });

  let pageNumber = 1;
  const nextPage = () => {
    pageNumber += 1;
    return pageNumber;
  };

  if (options?.includeGuide) {
    renderGuidePage(doc, pageNumber);
    doc.addPage();
    nextPage();
  }

  renderHeader(doc, report, pageNumber);
  for (const section of report.bandTemplate.sections) {
    renderSection(doc, report, section, nextPage);
  }

  if (report.populated.readingLevel || report.populated.lexile) {
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor(ASA_INK).text(
      `Reading snapshot: ${report.populated.readingLevel || ''} ${report.populated.lexile ? `Lexile ${report.populated.lexile}` : ''}`.trim(),
      { width: CONTENT_W },
    );
  }

  doc.fontSize(8).fillColor('#666').text(
    `Template ${report.templateVersion} · Generated ${new Date(report.generatedAt).toLocaleString()}`,
    { width: CONTENT_W, align: 'center' },
  );

  return finishAsaPdf(doc);
}
