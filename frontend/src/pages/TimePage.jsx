import { useState } from 'react';
import {
  Button, IconButton, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import useApi from '../hooks/useApi';
import useNotice from '../hooks/useNotice';
import { useAuth } from '../auth/useAuth';
import { api } from '../services/api';
import PageHeader from '../components/PageHeader';
import FormDialog from '../components/FormDialog';
import { EmptyState, ErrorState, Loading } from '../components/Feedback';
import { formatDate, today } from '../utils/format';

/** The signed-in person's timesheet across all their projects. */
export default function TimePage() {
  const { user } = useAuth();
  const entries = useApi('/time-entries', { user_id: user.id });
  const projects = useApi('/projects', { status: 'active' });
  const [open, setOpen] = useState(false);
  const [notice, notify] = useNotice();
  const projectOptions = (projects.data?.items || []).filter((p) => !p.is_archived)
    .map((p) => ({ value: p.id, label: p.name }));
  const [weekStart] = useState(() => new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10));
  const lastWeek = (entries.data?.items || []).filter((e) => e.work_date >= weekStart)
    .reduce((sum, e) => sum + Number(e.hours), 0);

  return (
    <>
      <PageHeader
        title="My time"
        summary={entries.data ? `${lastWeek} hours logged in the last 7 days.` : null}
        actions={(
          <Button variant="contained" startIcon={<AddIcon />} disabled={!projectOptions.length} onClick={() => setOpen(true)}>
            Log time
          </Button>
        )}
      />
      <Paper variant="outlined">
        {entries.loading && <Loading />}
        {entries.error && <ErrorState error={entries.error} onRetry={entries.reload} />}
        {entries.data && entries.data.items.length === 0 && (
          <EmptyState title="No time logged yet" hint={projectOptions.length ? 'Log your hours against a project.' : 'You can log time once your team is on an active project.'} />
        )}
        {entries.data && entries.data.items.length > 0 && (
          <TableContainer>
            <Table aria-label="My time entries">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Project</TableCell>
                  <TableCell align="right">Hours</TableCell>
                  <TableCell align="right"><span className="sr-only">Actions</span></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {entries.data.items.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{formatDate(e.work_date)}</TableCell>
                    <TableCell>
                      {e.project_name}
                      <Typography variant="body2" color="text.secondary">{[e.deliverable_name, e.note].filter(Boolean).join(': ')}</Typography>
                    </TableCell>
                    <TableCell align="right">{e.hours}</TableCell>
                    <TableCell align="right">
                      <IconButton
                        aria-label={`Delete ${e.hours} hours on ${formatDate(e.work_date)}`}
                        onClick={async () => { await api.del(`/time-entries/${e.id}`); notify('Time entry deleted.'); entries.reload(); }}
                      >
                        <DeleteOutline />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
      <FormDialog
        open={open}
        title="Log time"
        submitLabel="Log time"
        fields={[
          {
            name: 'project_id', label: 'Project', type: 'select', required: true, options: projectOptions,
          },
          { name: 'work_date', label: 'Date worked', type: 'date', required: true },
          {
            name: 'hours', label: 'Hours', type: 'number', required: true, min: 0.25, max: 24, step: 0.25,
          },
          { name: 'note', label: 'What did you work on?', type: 'textarea' },
        ]}
        initial={{ work_date: today() }}
        onClose={() => setOpen(false)}
        onSubmit={async (values) => { await api.post('/time-entries', values); notify('Time logged.'); entries.reload(); }}
      />
      {notice}
    </>
  );
}
