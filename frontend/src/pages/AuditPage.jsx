import { useState } from 'react';
import {
  Button, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import useApi from '../hooks/useApi';
import PageHeader from '../components/PageHeader';
import { EmptyState, ErrorState, Loading } from '../components/Feedback';

const ENTITIES = ['project', 'deliverable', 'user', 'team', 'allocation', 'time_entry', 'expense'];
const ACTIONS = ['create', 'update', 'archive', 'restore', 'assign_role', 'assign_team', 'complete', 'abandon', 'login'];
const PAGE = 50;

const describe = (changes) => Object.entries(changes || {}).slice(0, 4)
  .map(([k, v]) => `${k}: ${JSON.stringify(v.before) ?? '—'} → ${JSON.stringify(v.after) ?? '—'}`).join('; ');

/** Read-only record of every change (admin only). */
export default function AuditPage() {
  const [filters, setFilters] = useState({ entity_type: '', action: '' });
  const [offset, setOffset] = useState(0);
  const {
    data, loading, error, reload,
  } = useApi('/audit-log', { ...filters, limit: PAGE, offset });
  const set = (key) => (e) => { setOffset(0); setFilters((f) => ({ ...f, [key]: e.target.value })); };

  return (
    <>
      <PageHeader title="Audit log" summary="Every change to projects, people and plans. Entries cannot be edited or deleted." />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField select label="Record type" value={filters.entity_type} onChange={set('entity_type')} sx={{ minWidth: 180 }}>
          <MenuItem value="">Any</MenuItem>
          {ENTITIES.map((e) => <MenuItem key={e} value={e}>{e.replace('_', ' ')}</MenuItem>)}
        </TextField>
        <TextField select label="Action" value={filters.action} onChange={set('action')} sx={{ minWidth: 180 }}>
          <MenuItem value="">Any</MenuItem>
          {ACTIONS.map((a) => <MenuItem key={a} value={a}>{a.replace('_', ' ')}</MenuItem>)}
        </TextField>
      </Stack>
      {loading && <Loading />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.items.length === 0 && <Paper variant="outlined"><EmptyState title="No entries match" /></Paper>}
      {data && data.items.length > 0 && (
        <>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" aria-label="Audit log">
              <TableHead>
                <TableRow>
                  <TableCell>When</TableCell>
                  <TableCell>Who</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell>Record</TableCell>
                  <TableCell>Changes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.items.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(a.created_at).toLocaleString()}</TableCell>
                    <TableCell>{a.actor_name || 'System'}</TableCell>
                    <TableCell>{a.action.replace('_', ' ')}</TableCell>
                    <TableCell>{a.entity_type.replace('_', ' ')}</TableCell>
                    <TableCell sx={{ maxWidth: 420 }}>
                      <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word' }}>{describe(a.changes)}</Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2 }}>
            <Button disabled={offset === 0} onClick={() => setOffset(offset - PAGE)}>Newer</Button>
            <Typography variant="body2" color="text.secondary">{`${offset + 1}–${Math.min(offset + PAGE, data.total)} of ${data.total}`}</Typography>
            <Button disabled={offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>Older</Button>
          </Stack>
        </>
      )}
    </>
  );
}
