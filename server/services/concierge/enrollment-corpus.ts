/**
 * Public enrollment facts the anonymous concierge may quote.
 * Sources are the marketing home page and the school-code registration screen.
 * This is not a family record and not an internal runbook.
 */
export type EnrollmentCorpusEntry = {
  source: string;
  keywords: string[];
  text: string;
};

export const ENROLLMENT_CORPUS: EnrollmentCorpusEntry[] = [
  {
    source: "client/src/pages/Home.tsx",
    keywords: ["enroll", "enrollment", "academy", "program"],
    text: "American Seekers Academy provides personalized educational programs for children with easy enrollment. Parents browse and enroll in learning programs with flexible scheduling. From the public home page, Enroll Your Child starts an account and Parent Login is for families who already have one.",
  },
  {
    source: "client/src/pages/Register.tsx",
    keywords: ["school code", "registration code", "register", "sign up"],
    text: "To create an account, a parent needs a registration code from the school administrator. Each school has a unique code for enrolling families. The registration screen asks for that school code before an account is created. If you don't have a school code, contact your school administrator.",
  },
  {
    source: "client/src/pages/Home.tsx",
    keywords: ["sign in", "login", "parent login", "account"],
    text: "Parents who already have an account use Parent Login. The concierge can answer general enrollment questions before sign-in. Family details, week materials, and event RSVPs are available only after you sign in, and only for your own children.",
  },
  {
    source: "docs/parent-concierge/ADR-001.md",
    keywords: ["follow up", "corey", "contact the school"],
    text: "This chat cannot complete an enrollment, register a child, or take payment. If you want a person to follow up, leave your name, email, and question and the assistant can send that note to Corey. That note is a lead, not an enrollment.",
  },
];

export function answerFromEnrollmentCorpus(question: string): { grounded: boolean; text: string } {
  const q = question.toLowerCase();
  const hits = ENROLLMENT_CORPUS.filter((entry) => entry.keywords.some((keyword) => q.includes(keyword)));
  if (hits.length === 0) {
    return {
      grounded: false,
      text: "I can only answer enrollment questions from the school's published notes, and I don't have that detail. Share your name and email if you want me to ask Corey to follow up. I can't look up another family's records.",
    };
  }
  return {
    grounded: true,
    text: hits.map((entry) => entry.text).join("\n\n"),
  };
}

export function enrollmentCorpusPromptBlock(): string {
  return ENROLLMENT_CORPUS.map((entry) => `- ${entry.text}`).join("\n");
}
