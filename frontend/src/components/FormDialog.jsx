import { useState } from 'react';
import PropTypes from 'prop-types';
import {
  Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, ListItemText, MenuItem, Stack, TextField,
} from '@mui/material';
import { useMediaQuery } from 'react-responsive';
import { initialValues, toPayload, validateFields } from '../utils/validation';

/** The form inside the dialog; owns the field state. */
function FormBody({
  title, fields, initial = null, submitLabel, onSubmit, onClose, onBusy,
}) {
  const [values, setValues] = useState(() => initialValues(fields, initial));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const change = (name) => (e) => {
    setValues((v) => ({ ...v, [name]: e.target.value }));
    setErrors((er) => ({ ...er, [name]: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const found = validateFields(fields, values);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    onBusy(true);
    setFormError('');
    try {
      await onSubmit(toPayload(fields, values));
      onClose();
    } catch (err) {
      setErrors(err.fields || {});
      setFormError(err.message);
    } finally {
      setSaving(false);
      onBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {formError && <Alert severity="error">{formError}</Alert>}
          {fields.map((f) => {
            const common = {
              id: `field-${f.name}`,
              label: f.label,
              required: f.required,
              value: values[f.name] ?? '',
              onChange: change(f.name),
              error: Boolean(errors[f.name]),
              helperText: errors[f.name] || f.help,
              disabled: saving || f.readOnly,
            };
            if (f.type === 'select') {
              return (
                <TextField key={f.name} select {...common}>
                  {!f.required && <MenuItem value=""><em>None</em></MenuItem>}
                  {f.options.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                </TextField>
              );
            }
            if (f.type === 'multiselect') {
              return (
                <TextField
                  key={f.name}
                  select
                  {...common}
                  value={values[f.name] || []}
                  slotProps={{
                    select: {
                      multiple: true,
                      renderValue: (sel) => f.options.filter((o) => sel.includes(o.value)).map((o) => o.label).join(', '),
                    },
                  }}
                >
                  {f.options.map((o) => (
                    <MenuItem key={o.value} value={o.value}>
                      <Checkbox checked={(values[f.name] || []).includes(o.value)} size="small" />
                      <ListItemText primary={o.label} />
                    </MenuItem>
                  ))}
                </TextField>
              );
            }
            return (
              <TextField
                key={f.name}
                {...common}
                type={f.type === 'textarea' ? 'text' : f.type || 'text'}
                multiline={f.type === 'textarea'}
                minRows={f.type === 'textarea' ? 3 : undefined}
                slotProps={{
                  inputLabel: f.type === 'date' ? { shrink: true } : undefined,
                  htmlInput: { min: f.min, max: f.max, step: f.step },
                }}
              />
            );
          })}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={saving}>{saving ? 'Saving…' : submitLabel}</Button>
      </DialogActions>
    </form>
  );
}
FormBody.propTypes = {
  title: PropTypes.string.isRequired,
  fields: PropTypes.arrayOf(PropTypes.shape({})).isRequired,
  initial: PropTypes.shape({}),
  submitLabel: PropTypes.string.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onBusy: PropTypes.func.isRequired,
};

/**
 * Generic create/edit form in a dialog. The form remounts on every open, so it
 * always starts from `initial`.
 * fields: [{ name, label, type: text|email|password|number|date|select|multiselect|textarea, required, options }]
 */
export default function FormDialog({
  open, title, fields, initial = null, submitLabel = 'Save', onSubmit, onClose,
}) {
  const fullScreen = useMediaQuery({ maxWidth: 599 });
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullScreen={fullScreen} maxWidth="sm" fullWidth>
      {open && (
        <FormBody
          title={title}
          fields={fields}
          initial={initial}
          submitLabel={submitLabel}
          onSubmit={onSubmit}
          onClose={onClose}
          onBusy={setBusy}
        />
      )}
    </Dialog>
  );
}

FormDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  title: PropTypes.string.isRequired,
  fields: PropTypes.arrayOf(PropTypes.shape({
    name: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    type: PropTypes.string,
    required: PropTypes.bool,
    options: PropTypes.arrayOf(PropTypes.shape({ value: PropTypes.string, label: PropTypes.string })),
  })).isRequired,
  initial: PropTypes.shape({}),
  submitLabel: PropTypes.string,
  onSubmit: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};
