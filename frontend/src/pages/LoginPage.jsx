import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Paper, Stack, TextField, Typography,
} from '@mui/material';
import { useAuth } from '../auth/useAuth';
import ScheduleRail from '../components/ScheduleRail';
import { palette } from '../theme';

/** Sign-in with email or username. */
export default function LoginPage() {
  const { user, login, notice } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ login: '', password: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={location.state?.from || '/'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    const found = {};
    if (!form.login.trim()) found.login = 'Enter your email or username.';
    if (!form.password) found.password = 'Enter your password.';
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setError('');
    try {
      await login(form.login.trim(), form.password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{
      minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: palette.ink, p: 2,
    }}
    >
      <Paper sx={{ width: '100%', maxWidth: 400, p: { xs: 3, sm: 4 } }}>
        <Typography variant="h1" component="h1">ACME delivery tracker</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5 }}>
          See which projects are on schedule, who is stretched, and where the budget is going.
        </Typography>
        <ScheduleRail elapsedPct={62} completionPct={48} level="at_risk" />
        <Box component="form" onSubmit={submit} noValidate sx={{ mt: 3 }}>
          <Stack spacing={2}>
            {notice && <Alert severity="info">{notice}</Alert>}
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              id="login"
              label="Email or username"
              autoComplete="username"
              autoFocus
              value={form.login}
              onChange={(e) => setForm({ ...form, login: e.target.value })}
              error={Boolean(errors.login)}
              helperText={errors.login}
              disabled={busy}
            />
            <TextField
              id="password"
              label="Password"
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              error={Boolean(errors.password)}
              helperText={errors.password}
              disabled={busy}
            />
            <Button type="submit" variant="contained" size="large" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
}
