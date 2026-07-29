import { describe, expect, it } from '@jest/globals';
import {
  buildFormSubmissionEmailSummary,
  formatSubmissionValueForEmail,
} from '../lib/custom-form-submission';

describe('formatSubmissionValueForEmail', () => {
  it('shows fileName for attachments', () => {
    expect(
      formatSubmissionValueForEmail({
        fileName: 'Kristie_Searls_Resume.pdf',
        objectPath: '/objects/form-attachments/school-2/x.pdf',
      }),
    ).toBe('Kristie_Searls_Resume.pdf');
  });

  it('joins arrays and formats booleans', () => {
    expect(formatSubmissionValueForEmail(['Math', 'Science'])).toBe('Math, Science');
    expect(formatSubmissionValueForEmail(true)).toBe('Yes');
    expect(formatSubmissionValueForEmail(false)).toBe('No');
  });
});

describe('buildFormSubmissionEmailSummary', () => {
  const fields = [
    { id: 90, label: 'First Name', order: 1 },
    { id: 105, label: 'Resume (PDF or Word)', order: 16 },
    { id: 106, label: 'Civic knowledge: The U.S. Constitution begins with which phrase?', order: 17 },
  ];

  it('uses field labels instead of field_N keys', () => {
    const html = buildFormSubmissionEmailSummary(
      {
        field_90: 'Kristie',
        field_105: {
          fileName: 'Kristie_Searls_Resume.pdf',
          objectPath: '/objects/form-attachments/school-2/x.pdf',
        },
        field_106: 'We the People',
      },
      fields,
    );

    expect(html).toContain('<strong>First Name:</strong> Kristie');
    expect(html).toContain('<strong>Resume (PDF or Word):</strong> Kristie_Searls_Resume.pdf');
    expect(html).toContain(
      '<strong>Civic knowledge: The U.S. Constitution begins with which phrase?:</strong> We the People',
    );
    expect(html).not.toContain('field_90');
    expect(html).not.toContain('field_105');
    expect(html).not.toContain('objectPath');
  });

  it('orders items by field order', () => {
    const html = buildFormSubmissionEmailSummary(
      { field_106: 'We the People', field_90: 'Kristie' },
      fields,
    );
    const firstNamePos = html.indexOf('First Name');
    const civicPos = html.indexOf('Civic knowledge');
    expect(firstNamePos).toBeGreaterThanOrEqual(0);
    expect(civicPos).toBeGreaterThan(firstNamePos);
  });
});
