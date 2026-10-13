import { useCallback, useState } from 'react';
import { Alert, Snackbar } from '@mui/material';

/** Snackbar feedback for completed actions. Returns [element, show(message, severity)]. */
export default function useNotice() {
  const [notice, setNotice] = useState(null);
  const show = useCallback((message, severity = 'success') => setNotice({ message, severity }), []);
  const element = (
    <Snackbar
      open={Boolean(notice)}
      autoHideDuration={notice?.severity === 'warning' ? 8000 : 4000}
      onClose={() => setNotice(null)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      {notice ? <Alert severity={notice.severity} onClose={() => setNotice(null)} variant="filled">{notice.message}</Alert> : <span />}
    </Snackbar>
  );
  return [element, show];
}
