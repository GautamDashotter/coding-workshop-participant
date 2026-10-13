import { describe, expect, it } from 'vitest';
import { validateFields, toPayload, initialValues } from '../utils/validation';
import { daysLabel, formatMoney, formatPct } from '../utils/format';

const fields = [
  { name: 'name', label: 'Name', required: true },
  {
    name: 'hours', label: 'Hours', type: 'number', min: 1, max: 10,
  },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'start_date', label: 'Start', type: 'date' },
  { name: 'end_date', label: 'End', type: 'date' },
  { name: 'manager_id', label: 'Manager', readOnly: true },
];

describe('validateFields', () => {
  it('flags required, range, email and date order problems', () => {
    const errors = validateFields(fields, {
      name: '', hours: '50', email: 'nope', start_date: '2026-05-01', end_date: '2026-04-01',
    });
    expect(Object.keys(errors).sort()).toEqual(['email', 'end_date', 'hours', 'name']);
  });

  it('passes valid input', () => {
    expect(validateFields(fields, { name: 'X', hours: '5', email: 'a@b.co' })).toEqual({});
  });
});

describe('toPayload', () => {
  it('parses numbers, nulls blanks, drops read-only fields', () => {
    expect(toPayload(fields, { name: 'X', hours: '5', email: '', manager_id: 'abc' }))
      .toEqual({ name: 'X', hours: 5, email: null });
  });
});

describe('initialValues', () => {
  it('fills from a record and defaults missing fields', () => {
    expect(initialValues([{ name: 'a' }, { name: 'b', type: 'multiselect' }], { a: 1 })).toEqual({ a: 1, b: [] });
  });
});

describe('format helpers', () => {
  it('formats money, percentages and day counts', () => {
    expect(formatMoney(12500)).toBe('$12,500');
    expect(formatMoney(null)).toBe('—');
    expect(formatPct(41.6)).toBe('42%');
    expect(daysLabel(-3)).toBe('3 days late');
    expect(daysLabel(0)).toBe('Due today');
  });
});
