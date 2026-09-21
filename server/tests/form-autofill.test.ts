import { describe, expect, it } from '@jest/globals';
import { inferAutoFillKey } from '@shared/form-autofill';
import { applySubmitterAutoFill, getFieldAutoFill } from '../lib/custom-form-submission';

const samplePrefill = {
  memberId: 'ASA-2026-ABC',
  firstName: 'Jordan',
  lastName: 'Volunteer',
  fullName: 'Jordan Volunteer',
  email: 'jordan@example.com',
  phone: '555-0100',
  location: 'Brighton',
};

describe('form submitter auto-fill', () => {
  it('reads autoFill from fieldConfig', () => {
    expect(getFieldAutoFill({ autoFill: 'memberId' })).toBe('memberId');
    expect(getFieldAutoFill({})).toBeNull();
  });

  it('overwrites auto-fill fields from the logged-in parent', () => {
    const result = applySubmitterAutoFill({
      fields: [
        { id: 1, fieldConfig: { autoFill: 'memberId' } },
        { id: 2, fieldConfig: { autoFill: 'firstName' } },
        { id: 3, fieldConfig: {} },
      ],
      responseData: {
        field_1: 'FORGED',
        field_2: '',
        field_3: 'Cleaning Crew',
      },
      prefill: samplePrefill,
    });
    expect(result.field_1).toBe('ASA-2026-ABC');
    expect(result.field_2).toBe('Jordan');
    expect(result.field_3).toBe('Cleaning Crew');
  });

  it('restamps email and full name from heuristics', () => {
    const result = applySubmitterAutoFill({
      fields: [
        { id: 10, fieldType: 'text', label: 'Full Name', fieldConfig: {} },
        { id: 11, fieldType: 'email', label: 'Email', fieldConfig: {} },
        { id: 12, fieldType: 'textarea', label: 'Notes', fieldConfig: {} },
      ],
      responseData: {
        field_10: 'Forged Name',
        field_11: 'forged@example.com',
        field_12: 'Keep me',
      },
      prefill: samplePrefill,
    });
    expect(result.field_10).toBe('Jordan Volunteer');
    expect(result.field_11).toBe('jordan@example.com');
    expect(result.field_12).toBe('Keep me');
  });
});

describe('inferAutoFillKey', () => {
  it('matches common field types and labels', () => {
    expect(inferAutoFillKey({ fieldType: 'email', label: 'Work email' })).toBe('email');
    expect(inferAutoFillKey({ fieldType: 'text', label: 'Email Address' })).toBe('email');
    expect(inferAutoFillKey({ fieldType: 'phone', label: 'Phone Number' })).toBe('phone');
    expect(inferAutoFillKey({ fieldType: 'text', label: 'First Name' })).toBe('firstName');
    expect(inferAutoFillKey({ fieldType: 'text', label: 'Last Name' })).toBe('lastName');
    expect(inferAutoFillKey({ fieldType: 'text', label: 'Full Name' })).toBe('fullName');
    expect(inferAutoFillKey({ fieldType: 'text', label: 'Name' })).toBe('fullName');
    expect(inferAutoFillKey({ fieldType: 'text', label: 'Member ID' })).toBe('memberId');
    expect(inferAutoFillKey({ fieldType: 'dropdown', label: 'Campus' })).toBe('location');
  });

  it('skips emergency and child labels', () => {
    expect(inferAutoFillKey({ fieldType: 'phone', label: 'Emergency contact phone' })).toBeNull();
    expect(inferAutoFillKey({ fieldType: 'text', label: 'Child first name' })).toBeNull();
    expect(inferAutoFillKey({ fieldType: 'email', label: 'Student email' })).toBeNull();
    expect(inferAutoFillKey({ fieldType: 'text', label: 'Spouse name' })).toBeNull();
    expect(inferAutoFillKey({ fieldType: 'text', label: 'Reference name' })).toBeNull();
  });

  it('honors explicit override and none opt-out', () => {
    expect(
      inferAutoFillKey({
        fieldType: 'text',
        label: 'Notes',
        fieldConfig: { autoFill: 'firstName' },
      }),
    ).toBe('firstName');
    expect(
      inferAutoFillKey({
        fieldType: 'email',
        label: 'Email',
        fieldConfig: { autoFill: 'none' },
      }),
    ).toBeNull();
  });
});
