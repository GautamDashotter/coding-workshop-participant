import PropTypes from 'prop-types';
import {
  Alert, Box, Button, CircularProgress, Typography,
} from '@mui/material';

/** Centered spinner while data loads. */
export function Loading({ label = 'Loading…' }) {
  return (
    <Box role="status" aria-live="polite" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 6, justifyContent: 'center' }}>
      <CircularProgress size={22} />
      <Typography color="text.secondary">{label}</Typography>
    </Box>
  );
}
Loading.propTypes = { label: PropTypes.string };

/** Error with a retry action. */
export function ErrorState({ error = null, onRetry = null }) {
  return (
    <Alert
      severity="error"
      action={onRetry ? <Button color="inherit" size="small" onClick={onRetry}>Try again</Button> : null}
    >
      {error?.message || 'Something went wrong.'}
    </Alert>
  );
}
ErrorState.propTypes = { error: PropTypes.shape({ message: PropTypes.string }), onRetry: PropTypes.func };

/** Empty list that points to the next action. */
export function EmptyState({ title, hint = '', action = null }) {
  return (
    <Box sx={{ py: 5, px: 2, textAlign: 'center' }}>
      <Typography variant="subtitle2">{title}</Typography>
      {hint && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{hint}</Typography>}
      {action && <Box sx={{ mt: 2 }}>{action}</Box>}
    </Box>
  );
}
EmptyState.propTypes = { title: PropTypes.string.isRequired, hint: PropTypes.string, action: PropTypes.node };
