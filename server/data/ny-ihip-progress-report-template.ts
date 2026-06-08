/**
 * Verbatim copy source for ASA "Learning Progress Notes — IHIP & Quarterly Report".
 * Do not paraphrase skill labels — used on district-facing PDFs.
 */
import type { ProgressReportBand } from '../lib/resolve-progress-report-band';

export const IHIP_TEMPLATE_VERSION = '2026-05-asa-v1';

export const IHIP_GUIDE = {
  title: 'ASA Learning Progress Notes',
  subtitle: 'Aligned for New York State IHIP & Quarterly Reports',
  sections: [
    {
      heading: 'How to Use These Notes for IHIP & Quarterly Reports',
      paragraphs: [
        'These progress notes are designed to help ASA families easily meet New York homeschool reporting requirements while keeping things simple and tied to our co-op curriculum.',
      ],
    },
    {
      heading: 'For Your IHIP (submitted once per year)',
      bullets: [
        'Use the subject areas and ASA curriculum references in the "plan of instruction" section.',
        'List instructors as: Parent(s) (DO NOT put American Seekers Academy on the form)',
        'Choose 4 evenly spaced quarterly report dates and list them.',
      ],
    },
    {
      heading: 'For Quarterly Reports (submitted 4x per year)',
      bullets: [
        'Fill in the Quarter/Dates and Total Hours fields below.',
        'Briefly note key material covered this quarter.',
        'Use the checklist/evaluation sections as your narrative or graded progress summary.',
        'Co-op hours with ASA mentors count toward your total instructional hours (900 hrs/year for K–6, 990 for 7–12).',
      ],
    },
    {
      heading: 'Tip',
      paragraphs: [
        'Keep copies of these completed notes — they make excellent supporting documentation if your district ever requests more detail.',
      ],
    },
  ],
  footer: 'Page 1 | For NY Homeschool IHIP & Quarterly Reporting',
};

export type SkillRow = {
  key: string;
  label: string;
  columns?: ('fall' | 'winter' | 'spring')[];
};

export type ReportSection = {
  key: string;
  title: string;
  instructions?: string;
  skills?: SkillRow[];
  staticLines?: string[];
};

export type ReportBandTemplate = {
  band: ProgressReportBand;
  pdfPage: number;
  sections: ReportSection[];
};

const TERM_COLS: ('fall' | 'winter' | 'spring')[] = ['fall', 'winter', 'spring'];

export const REPORT_HEADER_LABELS = {
  studentName: 'Student Name:',
  mentorInstructor: 'Mentor / Instructor:',
  quarterDates: 'Quarter / Dates:',
  totalHours: 'Total Hours This Quarter:',
  keyMaterial: 'Key Material Covered This Quarter (brief):',
};

export const REPORT_BANDS: Record<ProgressReportBand, ReportBandTemplate> = {
  early: {
    band: 'early',
    pdfPage: 2,
    sections: [
      {
        key: 'sel',
        title: 'Social and Emotional Skills (check ✓ if student demonstrates skill consistently)',
        skills: [
          { key: 'sel_emotions', label: 'Student can identify their own emotions', columns: TERM_COLS },
          { key: 'sel_regulate', label: 'With support, student can make choices to regulate emotions (e.g., belly breathing, taking a break)', columns: TERM_COLS },
          { key: 'sel_listening', label: 'Student uses listening skills to identify the feelings and perspectives of others', columns: TERM_COLS },
          { key: 'sel_respect', label: 'Student shows respect to classmates and adults', columns: TERM_COLS },
          { key: 'sel_relationships', label: 'Student seeks out meaningful relationships with peers', columns: TERM_COLS },
          { key: 'sel_directions', label: 'Student is able to follow directions appropriately', columns: TERM_COLS },
        ],
      },
      {
        key: 'literacy',
        title: 'Literacy (check ✓ if student demonstrates skill consistently or N/A if Pre-K level)',
        skills: [
          { key: 'lit_phonograms', label: 'Phonograms', columns: TERM_COLS },
          { key: 'lit_code_words', label: 'Student can read basic code words (VC and CVC words)', columns: TERM_COLS },
          { key: 'lit_own_sentences', label: 'Student can read their own sentences that have been written', columns: TERM_COLS },
        ],
      },
      {
        key: 'writing',
        title: 'Writing (check ✓ if student demonstrates skill consistently)',
        skills: [
          { key: 'wri_grip', label: 'Student can properly grip a pencil', columns: TERM_COLS },
          { key: 'wri_motor', label: 'Student has strong fine motor skills / continues to build fine motor skills', columns: TERM_COLS },
          { key: 'wri_clock', label: 'Student can write clock stroke letters (c, o, d, a, s, g, qu)', columns: TERM_COLS },
          { key: 'wri_line', label: 'Student can write line letters, dash line, tall line, and slant stroke letters', columns: TERM_COLS },
          { key: 'wri_sentence', label: 'With support, student can write a complete sentence', columns: TERM_COLS },
        ],
      },
      {
        key: 'math',
        title: 'Math',
        staticLines: [
          'Pre-Kindergarten: Match, sort, classify • Compare sizes • Count & identify 1-5 and 1-10 • Shapes • More/fewer • Compose/decompose • Beginning addition/subtraction',
          'Kindergarten: (Fall) ________ % (Winter) ________ % (Spring)',
        ],
      },
      { key: 'notes', title: 'Notes / Observations:', skills: [] },
    ],
  },
  lower: {
    band: 'lower',
    pdfPage: 3,
    sections: [
      {
        key: 'sel',
        title: 'Social and Emotional Skills (check ✓ if student demonstrates skill consistently)',
        skills: [
          { key: 'sel_regulate', label: 'Student can identify and practice self-regulation skills and coping strategies', columns: TERM_COLS },
          { key: 'sel_listening', label: 'Student uses listening skills to identify the feelings and perspectives of others', columns: TERM_COLS },
          { key: 'sel_respect', label: 'Student shows respect to classmates and adults', columns: TERM_COLS },
          { key: 'sel_goal', label: 'Student can set a short-term goal and begin working toward it', columns: TERM_COLS },
          { key: 'sel_cues', label: 'Student can identify cues that indicate how others may feel and communicate understanding', columns: TERM_COLS },
        ],
      },
      {
        key: 'literacy',
        title: 'Literacy',
        skills: [
          { key: 'lit_phonograms', label: 'Phonograms', columns: TERM_COLS },
          { key: 'lit_reading_level', label: 'Current Reading Level or Basic Code Assessment Score', columns: TERM_COLS },
        ],
      },
      {
        key: 'writing',
        title: 'Writing (check ✓ if student demonstrates skill consistently)',
        skills: [
          { key: 'wri_idea', label: 'Student is able to create an idea when it is time to write', columns: TERM_COLS },
          { key: 'wri_sentences', label: 'Student can successfully write complete sentences using correct punctuation and grammar', columns: TERM_COLS },
          { key: 'wri_organized', label: 'Student has clear and organized thoughts when writing', columns: TERM_COLS },
          { key: 'wri_genres', label: 'Student can write narratives, informative texts, or opinion pieces (with support as needed)', columns: TERM_COLS },
        ],
      },
      {
        key: 'math',
        title: 'Math',
        staticLines: ['Current Level: 1B / 2A / 2B / 3A/ 3B (Fall) ________ % (Winter) ________ % (Spring) _________'],
      },
      { key: 'notes', title: 'Notes / Observations:', skills: [] },
    ],
  },
  mid: {
    band: 'mid',
    pdfPage: 4,
    sections: [
      {
        key: 'sel',
        title: 'Social and Emotional Skills (check ✓ if student demonstrates skill consistently)',
        skills: [
          { key: 'sel_regulate', label: 'Student can identify and practice self-regulation skills and coping strategies', columns: TERM_COLS },
          { key: 'sel_listening', label: 'Student uses listening skills to identify the feelings and perspectives of others', columns: TERM_COLS },
          { key: 'sel_respect', label: 'Student shows respect to classmates and adults', columns: TERM_COLS },
          { key: 'sel_goal', label: 'Student can set a short-term goal and begin working toward it', columns: TERM_COLS },
          { key: 'sel_cues', label: 'Student can identify cues that indicate how others may feel and communicate understanding', columns: TERM_COLS },
        ],
      },
      {
        key: 'literacy',
        title: 'Literacy',
        skills: [
          { key: 'lit_phonograms', label: 'Phonograms', columns: TERM_COLS },
          { key: 'lit_reading_level', label: 'Current Reading Level or Basic Code Assessment Score', columns: TERM_COLS },
        ],
      },
      {
        key: 'writing',
        title: 'Writing (check ✓ if student demonstrates skill consistently)',
        skills: [
          { key: 'wri_idea', label: 'Student is able to create an idea when it is time to write', columns: TERM_COLS },
          { key: 'wri_sentences', label: 'Student can successfully write complete sentences using correct punctuation and grammar', columns: TERM_COLS },
          { key: 'wri_organized', label: 'Student has clear and organized thoughts when writing', columns: TERM_COLS },
          { key: 'wri_genres', label: 'Student can write narratives, informative texts, or opinion pieces (with support as needed)', columns: TERM_COLS },
        ],
      },
      {
        key: 'math',
        title: 'Math',
        staticLines: ['Current Level: 1B / 2A / 2B / 3A/ 3B (Fall) ________ % (Winter) ________ % (Spring)'],
      },
      { key: 'notes', title: 'Notes / Observations:', skills: [] },
    ],
  },
  upper: {
    band: 'upper',
    pdfPage: 5,
    sections: [
      {
        key: 'sel',
        title: 'Social and Emotional Skills (check ✓ if student demonstrates skill consistently)',
        skills: [
          { key: 'sel_regulate_strong', label: 'Student can apply self-regulation skills to effectively express emotions, including strong emotions', columns: TERM_COLS },
          { key: 'sel_respect', label: 'Student shows respect to classmates and adults', columns: TERM_COLS },
          { key: 'sel_strengths', label: 'Student can identify how personal strengths, challenges, and experiences influence choices', columns: TERM_COLS },
          { key: 'sel_plan', label: 'Student demonstrates how to develop a plan and prioritize steps toward a goal', columns: TERM_COLS },
          { key: 'sel_perspective', label: 'Student practices perspective-taking and respectful curiosity across differences', columns: TERM_COLS },
        ],
      },
      {
        key: 'literacy',
        title: 'Literacy',
        skills: [
          { key: 'lit_phonograms', label: 'Phonograms', columns: TERM_COLS },
          { key: 'lit_reading_level', label: 'Current Reading Level or Basic Code Assessment Score', columns: TERM_COLS },
        ],
      },
      {
        key: 'writing',
        title: 'Writing (check ✓ if student demonstrates skill consistently)',
        skills: [
          { key: 'wri_idea', label: 'Student is able to create an idea when it is time to write', columns: TERM_COLS },
          { key: 'wri_sentences', label: 'Student can write complete sentences with correct punctuation and grammar', columns: TERM_COLS },
          { key: 'wri_planning', label: 'Student has clear and organized thoughts; can develop and strengthen writing through planning/editing', columns: TERM_COLS },
          { key: 'wri_arguments', label: 'Student can write narratives, informative/explanatory texts, or arguments (with support)', columns: TERM_COLS },
        ],
      },
      {
        key: 'math',
        title: 'Math',
        staticLines: ['Current Level: 4A / 4B / 5A / 5B / 6A / 6B (Fall) ________ % (Winter) ________ % (Spring)'],
      },
      { key: 'notes', title: 'Notes / Observations:', skills: [] },
    ],
  },
  secondary: {
    band: 'secondary',
    pdfPage: 6,
    sections: [
      {
        key: 'sel',
        title: 'Social and Emotional / Life Readiness Skills (check ✓ if student demonstrates skill consistently)',
        skills: [
          { key: 'sel_time', label: 'Student demonstrates effective time management and prioritization of academic/personal goals', columns: TERM_COLS },
          { key: 'sel_stress', label: 'Student applies self-regulation and stress-management strategies independently', columns: TERM_COLS },
          { key: 'sel_long_goal', label: 'Student can develop and follow through on long-term academic or personal goals', columns: TERM_COLS },
          { key: 'sel_leadership', label: 'Student shows leadership, responsibility, and respectful engagement in group or community settings', columns: TERM_COLS },
          { key: 'sel_dialogue', label: 'Student practices perspective-taking and constructive dialogue across differing viewpoints', columns: TERM_COLS },
        ],
      },
      {
        key: 'literacy_writing',
        title: 'Literacy & Writing (Advanced) (check ✓ if student demonstrates skill consistently)',
        instructions: 'Current Focus: Literary Analysis / Research Writing / Argumentation / Expository',
        skills: [
          { key: 'lw_evidence', label: 'Student produces clear, well-organized, and evidence-based writing (essays, research papers, arguments)', columns: TERM_COLS },
          { key: 'lw_comprehension', label: 'Student demonstrates strong reading comprehension and critical analysis of complex texts', columns: TERM_COLS },
          { key: 'lw_extended', label: 'Student can plan, draft, revise, and edit extended writing projects independently', columns: TERM_COLS },
          { key: 'lw_citation', label: 'Student uses proper citation and research skills when incorporating sources', columns: TERM_COLS },
        ],
      },
      {
        key: 'math',
        title: 'Mathematics',
        staticLines: [
          'Current Level: 4A / 4B / 5A / 5B / 6A / 6B / 7A / 7B / 8A / 8B (Fall) ________ % (Winter) ________ % (Spring)',
          'Progress / Mastery this Quarter: _______________________________________________________________',
        ],
      },
      {
        key: 'other_core',
        title: 'Other Core Subjects (Science, History/Social Studies, etc.)',
        staticLines: [
          'Key topics or units covered this quarter: _______________________________________________________________',
          'Progress / Understanding: _______________________________________________________________',
        ],
      },
      {
        key: 'notes',
        title: 'Notes / Observations (including any college-level work, dual enrollment, or independent projects):',
        skills: [],
      },
    ],
  },
};

export function getBandTemplate(band: ProgressReportBand): ReportBandTemplate {
  return REPORT_BANDS[band];
}

export function allSkillKeysForBand(band: ProgressReportBand): string[] {
  const keys: string[] = [];
  for (const section of REPORT_BANDS[band].sections) {
    for (const skill of section.skills || []) {
      keys.push(skill.key);
    }
  }
  return keys;
}
