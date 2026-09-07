/**
 * Curated National + NY education standards anchors and Lexile KPI thresholds.
 * Not a full DOE dump — expandable per state via additional seed files.
 */

export type SeedStandard = {
  code: string;
  title: string;
  description: string;
  gradeLevels: string[];
  sortOrder: number;
};

export type SeedKpi = {
  gradeLevel: string;
  belowMax: number;
  atMin: number;
  atMax: number;
  aboveMin: number;
  sourceNote: string;
};

/** Approximate Lexile "on track" bands by grade (National baseline). */
export const US_LEXILE_KPI: SeedKpi[] = [
  { gradeLevel: "kindergarten", belowMax: 99, atMin: 100, atMax: 300, aboveMin: 301, sourceNote: "ASA National Lexile band v1 (K)" },
  { gradeLevel: "1st-grade", belowMax: 189, atMin: 190, atMax: 530, aboveMin: 531, sourceNote: "ASA National Lexile band v1 (G1)" },
  { gradeLevel: "2nd-grade", belowMax: 419, atMin: 420, atMax: 650, aboveMin: 651, sourceNote: "ASA National Lexile band v1 (G2)" },
  { gradeLevel: "3rd-grade", belowMax: 519, atMin: 520, atMax: 820, aboveMin: 821, sourceNote: "ASA National Lexile band v1 (G3)" },
  { gradeLevel: "4th-grade", belowMax: 739, atMin: 740, atMax: 940, aboveMin: 941, sourceNote: "ASA National Lexile band v1 (G4)" },
  { gradeLevel: "5th-grade", belowMax: 829, atMin: 830, atMax: 1010, aboveMin: 1011, sourceNote: "ASA National Lexile band v1 (G5)" },
  { gradeLevel: "6th-grade", belowMax: 924, atMin: 925, atMax: 1070, aboveMin: 1071, sourceNote: "ASA National Lexile band v1 (G6)" },
  { gradeLevel: "7th-grade", belowMax: 969, atMin: 970, atMax: 1120, aboveMin: 1121, sourceNote: "ASA National Lexile band v1 (G7)" },
  { gradeLevel: "8th-grade", belowMax: 1009, atMin: 1010, atMax: 1185, aboveMin: 1186, sourceNote: "ASA National Lexile band v1 (G8)" },
];

/** NY bands slightly tighter at the bottom for early grades (intentional delta vs National). */
export const NY_LEXILE_KPI: SeedKpi[] = US_LEXILE_KPI.map((row) => {
  if (row.gradeLevel === "kindergarten" || row.gradeLevel === "1st-grade" || row.gradeLevel === "2nd-grade") {
    return {
      ...row,
      belowMax: row.belowMax + 20,
      atMin: row.atMin + 20,
      sourceNote: `ASA NY Lexile band v1 (${row.gradeLevel}) — aligned to NY Next Gen literacy expectations`,
    };
  }
  return {
    ...row,
    sourceNote: `ASA NY Lexile band v1 (${row.gradeLevel})`,
  };
});

export const US_ELA_STANDARDS: SeedStandard[] = [
  { code: "CCSS.ELA-LITERACY.RF.K.1", title: "Print concepts", description: "Demonstrate understanding of the organization and basic features of print.", gradeLevels: ["kindergarten"], sortOrder: 10 },
  { code: "CCSS.ELA-LITERACY.RF.K.2", title: "Phonological awareness", description: "Demonstrate understanding of spoken words, syllables, and sounds.", gradeLevels: ["kindergarten"], sortOrder: 20 },
  { code: "CCSS.ELA-LITERACY.RF.1.3", title: "Phonics and word recognition", description: "Know and apply grade-level phonics and word analysis skills in decoding words.", gradeLevels: ["1st-grade"], sortOrder: 30 },
  { code: "CCSS.ELA-LITERACY.RL.1.1", title: "Ask and answer questions", description: "Ask and answer questions about key details in a text.", gradeLevels: ["1st-grade"], sortOrder: 40 },
  { code: "CCSS.ELA-LITERACY.RF.2.4", title: "Fluency", description: "Read with sufficient accuracy and fluency to support comprehension.", gradeLevels: ["2nd-grade"], sortOrder: 50 },
  { code: "CCSS.ELA-LITERACY.RL.2.1", title: "Ask and answer who/what/where/when/why/how", description: "Ask and answer such questions as who, what, where, when, why, and how to demonstrate understanding of key details.", gradeLevels: ["2nd-grade"], sortOrder: 60 },
  { code: "CCSS.ELA-LITERACY.RL.3.1", title: "Ask and answer to demonstrate understanding", description: "Ask and answer questions to demonstrate understanding of a text, referring explicitly to the text.", gradeLevels: ["3rd-grade"], sortOrder: 70 },
  { code: "CCSS.ELA-LITERACY.RI.3.2", title: "Main idea and key details", description: "Determine the main idea of a text; recount the key details and explain how they support the main idea.", gradeLevels: ["3rd-grade"], sortOrder: 80 },
  { code: "CCSS.ELA-LITERACY.RL.4.1", title: "Refer to details and examples", description: "Refer to details and examples in a text when explaining what the text says explicitly and when drawing inferences.", gradeLevels: ["4th-grade"], sortOrder: 90 },
  { code: "CCSS.ELA-LITERACY.RI.4.2", title: "Determine main idea", description: "Determine the main idea of a text and explain how it is supported by key details; summarize the text.", gradeLevels: ["4th-grade"], sortOrder: 100 },
  { code: "CCSS.ELA-LITERACY.RL.5.1", title: "Quote accurately", description: "Quote accurately from a text when explaining what the text says explicitly and when drawing inferences.", gradeLevels: ["5th-grade"], sortOrder: 110 },
  { code: "CCSS.ELA-LITERACY.RI.5.2", title: "Two or more main ideas", description: "Determine two or more main ideas of a text and explain how they are supported by key details; summarize the text.", gradeLevels: ["5th-grade"], sortOrder: 120 },
  { code: "CCSS.ELA-LITERACY.RL.6.1", title: "Cite textual evidence", description: "Cite textual evidence to support analysis of what the text says explicitly as well as inferences drawn from the text.", gradeLevels: ["6th-grade"], sortOrder: 130 },
  { code: "CCSS.ELA-LITERACY.RI.6.2", title: "Central idea", description: "Determine a central idea of a text and how it is conveyed through particular details; provide a summary distinct from personal opinions.", gradeLevels: ["6th-grade"], sortOrder: 140 },
  { code: "CCSS.ELA-LITERACY.RL.7.1", title: "Cite several pieces of evidence", description: "Cite several pieces of textual evidence to support analysis of what the text says explicitly as well as inferences.", gradeLevels: ["7th-grade"], sortOrder: 150 },
  { code: "CCSS.ELA-LITERACY.RL.8.1", title: "Cite strongest evidence", description: "Cite the textual evidence that most strongly supports an analysis of what the text says explicitly as well as inferences.", gradeLevels: ["8th-grade"], sortOrder: 160 },
];

export const US_MATH_STANDARDS: SeedStandard[] = [
  { code: "CCSS.MATH.CONTENT.K.CC.A.1", title: "Count to 100", description: "Count to 100 by ones and by tens.", gradeLevels: ["kindergarten"], sortOrder: 10 },
  { code: "CCSS.MATH.CONTENT.1.OA.A.1", title: "Word problems within 20", description: "Use addition and subtraction within 20 to solve word problems.", gradeLevels: ["1st-grade"], sortOrder: 20 },
  { code: "CCSS.MATH.CONTENT.2.NBT.A.1", title: "Understand place value", description: "Understand that the three digits of a three-digit number represent hundreds, tens, and ones.", gradeLevels: ["2nd-grade"], sortOrder: 30 },
  { code: "CCSS.MATH.CONTENT.3.OA.A.1", title: "Interpret products", description: "Interpret products of whole numbers.", gradeLevels: ["3rd-grade"], sortOrder: 40 },
  { code: "CCSS.MATH.CONTENT.3.NF.A.1", title: "Understand fractions", description: "Understand a fraction 1/b as the quantity formed by 1 part when a whole is partitioned into b equal parts.", gradeLevels: ["3rd-grade"], sortOrder: 50 },
  { code: "CCSS.MATH.CONTENT.4.NBT.B.4", title: "Fluently add and subtract multi-digit", description: "Fluently add and subtract multi-digit whole numbers using the standard algorithm.", gradeLevels: ["4th-grade"], sortOrder: 60 },
  { code: "CCSS.MATH.CONTENT.5.NF.A.1", title: "Add and subtract fractions", description: "Add and subtract fractions with unlike denominators.", gradeLevels: ["5th-grade"], sortOrder: 70 },
  { code: "CCSS.MATH.CONTENT.6.RP.A.1", title: "Understand ratio concepts", description: "Understand the concept of a ratio and use ratio language to describe a ratio relationship between two quantities.", gradeLevels: ["6th-grade"], sortOrder: 80 },
  { code: "CCSS.MATH.CONTENT.7.RP.A.2", title: "Proportional relationships", description: "Recognize and represent proportional relationships between quantities.", gradeLevels: ["7th-grade"], sortOrder: 90 },
  { code: "CCSS.MATH.CONTENT.8.EE.A.1", title: "Integer exponents", description: "Know and apply the properties of integer exponents to generate equivalent numerical expressions.", gradeLevels: ["8th-grade"], sortOrder: 100 },
];

export const NY_ELA_STANDARDS: SeedStandard[] = [
  { code: "NY-ELA.PKRF1", title: "Print concepts (PK–K)", description: "Demonstrate understanding of the organization and basic features of print (NY Next Generation).", gradeLevels: ["pre-k", "kindergarten"], sortOrder: 10 },
  { code: "NY-ELA.1RF3", title: "Phonics and word recognition", description: "Know and apply grade-level phonics and word analysis skills in decoding words.", gradeLevels: ["1st-grade"], sortOrder: 20 },
  { code: "NY-ELA.2R1", title: "Key ideas and details", description: "Ask and answer questions such as who, what, where, when, why, and how to demonstrate understanding of key details.", gradeLevels: ["2nd-grade"], sortOrder: 30 },
  { code: "NY-ELA.3R1", title: "Ask and answer questions", description: "Develop and answer questions to locate relevant and specific details in a text to support an answer or inference.", gradeLevels: ["3rd-grade"], sortOrder: 40 },
  { code: "NY-ELA.3R2", title: "Central idea", description: "Determine a theme or central idea and explain how it is supported by key details; summarize portions of a text.", gradeLevels: ["3rd-grade"], sortOrder: 50 },
  { code: "NY-ELA.4R1", title: "Refer to details", description: "Locate and refer to relevant details and evidence when explaining what a text says explicitly/implicitly.", gradeLevels: ["4th-grade"], sortOrder: 60 },
  { code: "NY-ELA.5R1", title: "Quote accurately", description: "Quote accurately from a text when explaining what the text says explicitly/implicitly and when drawing inferences.", gradeLevels: ["5th-grade"], sortOrder: 70 },
  { code: "NY-ELA.6R1", title: "Cite textual evidence", description: "Cite textual evidence to support an analysis of what the text says explicitly/implicitly and make logical inferences.", gradeLevels: ["6th-grade"], sortOrder: 80 },
  { code: "NY-ELA.7R1", title: "Cite several pieces of evidence", description: "Cite several pieces of textual evidence to support an analysis of what the text says explicitly/implicitly.", gradeLevels: ["7th-grade"], sortOrder: 90 },
  { code: "NY-ELA.8R1", title: "Strongest supporting evidence", description: "Cite the textual evidence that most strongly supports an analysis of what the text says explicitly/implicitly.", gradeLevels: ["8th-grade"], sortOrder: 100 },
];

export const NY_MATH_STANDARDS: SeedStandard[] = [
  { code: "NY-MATH.K.CC.1", title: "Count to 100", description: "Count to 100 by ones and by tens (NY Next Generation Mathematics).", gradeLevels: ["kindergarten"], sortOrder: 10 },
  { code: "NY-MATH.1.OA.1", title: "Word problems within 20", description: "Use addition and subtraction within 20 to solve word problems.", gradeLevels: ["1st-grade"], sortOrder: 20 },
  { code: "NY-MATH.2.NBT.1", title: "Understand place value", description: "Understand that the three digits of a three-digit number represent amounts of hundreds, tens, and ones.", gradeLevels: ["2nd-grade"], sortOrder: 30 },
  { code: "NY-MATH.3.OA.1", title: "Interpret products", description: "Interpret products of whole numbers.", gradeLevels: ["3rd-grade"], sortOrder: 40 },
  { code: "NY-MATH.3.NF.1", title: "Understand unit fractions", description: "Understand a fraction 1/b as the quantity formed by 1 part when a whole is partitioned into b equal parts.", gradeLevels: ["3rd-grade"], sortOrder: 50 },
  { code: "NY-MATH.4.NBT.4", title: "Fluently add and subtract", description: "Fluently add and subtract multi-digit whole numbers using the standard algorithm.", gradeLevels: ["4th-grade"], sortOrder: 60 },
  { code: "NY-MATH.5.NF.1", title: "Add and subtract fractions", description: "Add and subtract fractions with unlike denominators.", gradeLevels: ["5th-grade"], sortOrder: 70 },
  { code: "NY-MATH.6.RP.1", title: "Understand ratios", description: "Understand the concept of a ratio and use ratio language to describe a ratio relationship.", gradeLevels: ["6th-grade"], sortOrder: 80 },
  { code: "NY-MATH.7.RP.2", title: "Proportional relationships", description: "Recognize and represent proportional relationships between quantities.", gradeLevels: ["7th-grade"], sortOrder: 90 },
  { code: "NY-MATH.8.EE.1", title: "Integer exponents", description: "Know and apply the properties of integer exponents to generate equivalent numerical expressions.", gradeLevels: ["8th-grade"], sortOrder: 100 },
];
