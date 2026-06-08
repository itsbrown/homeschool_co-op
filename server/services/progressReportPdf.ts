import PDFDocument from 'pdfkit';
import type { StudentProgressReportDto } from '../lib/build-student-progress-report';
import { IHIP_GUIDE } from '../data/ny-ihip-progress-report-template';

const FONT = 'Helvetica';
const BOLD = 'Helvetica-Bold';
const MARGIN = 50;
const PAGE_W = 612;
const CONTENT_W = PAGE_W - MARGIN * 2;

function checkMark(status: string | undefined): string {
  if (status === 'consistent') return '☑';
  if (status === 'na') return 'N/A';
  return '☐';
}

function renderGuidePage(doc: PDFKit.PDFDocument): void {
  doc.font(BOLD).fontSize(14).text(IHIP_GUIDE.title, { align: 'center' });
  doc.moveDown(0.3);
  doc.font(FONT).fontSize(11).text(IHIP_GUIDE.subtitle, { align: 'center' });
  doc.moveDown(1);
  for (const section of IHIP_GUIDE.sections) {
    doc.font(BOLD).fontSize(11).text(section.heading);
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
  doc.fontSize(9).fillColor('#666').text(IHIP_GUIDE.footer, MARGIN, doc.page.height - 40, {
    width: CONTENT_W,
    align: 'center',
  });
  doc.fillColor('#000');
}

function renderHeader(doc: PDFKit.PDFDocument, report: StudentProgressReportDto): void {
  const h = report.header;
  doc.font(BOLD).fontSize(12).text('ASA Learning Progress Notes', { align: 'center' });
  doc.font(FONT).fontSize(9).text('For NY Homeschool IHIP & Quarterly Reporting', { align: 'center' });
  doc.moveDown(0.8);
  doc.fontSize(10);
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
): void {
  if (doc.y > doc.page.height - 120) doc.addPage();

  doc.font(BOLD).fontSize(10).text(section.title, { width: CONTENT_W });
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
    if (doc.y > doc.page.height - 60) doc.addPage();
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
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: MARGIN, info: {
      Title: `ASA Quarterly Report - ${report.header.studentName}`,
      Author: 'American Seekers Academy',
    }});
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    if (options?.includeGuide) {
      renderGuidePage(doc);
      doc.addPage();
    }

    renderHeader(doc, report);
    for (const section of report.bandTemplate.sections) {
      renderSection(doc, report, section);
    }

    if (report.populated.readingLevel || report.populated.lexile) {
      doc.moveDown(0.3);
      doc.fontSize(9).text(
        `Reading snapshot: ${report.populated.readingLevel || ''} ${report.populated.lexile ? `Lexile ${report.populated.lexile}` : ''}`.trim(),
        { width: CONTENT_W },
      );
    }

    doc.fontSize(8).fillColor('#666').text(
      `Template ${report.templateVersion} · Generated ${new Date(report.generatedAt).toLocaleString()} · Page ${doc.bufferedPageRange().count}`,
      MARGIN,
      doc.page.height - 36,
      { width: CONTENT_W, align: 'center' },
    );

    doc.end();
  });
}
