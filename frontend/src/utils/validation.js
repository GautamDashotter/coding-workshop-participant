/**
 * Client-side checks that mirror the API rules, so errors show before submitting.
 * @param {Array<object>} fields form field definitions
 * @param {object} values current form values
 * @returns {object} map of field name to error message
 */
export function validateFields(fields, values) {
  const errors = {};
  fields.forEach((f) => {
    const v = values[f.name];
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length && f.required);
    if (f.required && empty) errors[f.name] = 'This field is required.';
    else if (!empty && f.type === 'number') {
      const n = Number(v);
      if (Number.isNaN(n)) errors[f.name] = 'Must be a number.';
      else if (f.min !== undefined && n < f.min) errors[f.name] = `Must be at least ${f.min}.`;
      else if (f.max !== undefined && n > f.max) errors[f.name] = `Must be at most ${f.max}.`;
    } else if (!empty && f.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
      errors[f.name] = 'Enter a valid email address.';
    } else if (!empty && f.minLength && String(v).length < f.minLength) {
      errors[f.name] = `Use at least ${f.minLength} characters.`;
    }
  });
  if (values.start_date && values.end_date && values.end_date < values.start_date) {
    errors.end_date = 'Must be after the start date.';
  }
  return errors;
}

/**
 * Convert form values to an API payload: numbers parsed, blanks sent as null, read-only fields dropped.
 */
export const toPayload = (fields, values) => Object.fromEntries(fields
  .filter((f) => !f.readOnly)
  .map((f) => {
    const v = values[f.name];
    if (f.type === 'number') return [f.name, v === '' || v === undefined ? null : Number(v)];
    if (v === '') return [f.name, null];
    return [f.name, v];
  })
  .filter(([, v]) => v !== undefined));

/** Starting values for a form from an optional record. */
export const initialValues = (fields, initial) => Object.fromEntries(
  fields.map((f) => [f.name, initial?.[f.name] ?? (f.type === 'multiselect' ? [] : '')]),
);
