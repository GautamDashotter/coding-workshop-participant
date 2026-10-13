import { useState } from 'react';
import PropTypes from 'prop-types';
import {
  Box, Button, IconButton, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import useApi from '../../hooks/useApi';
import { useAuth } from '../../auth/useAuth';
import { api } from '../../services/api';
import FormDialog from '../../components/FormDialog';
import { EmptyState, ErrorState, Loading } from '../../components/Feedback';
import { formatDate, today } from '../../utils/format';

/** Form fields for logging time; deliverables optional. */
const timeFields = (deliverables) => [
  { name: 'work_date', label: 'Date worked', type: 'date', required: true },
  {
    name: 'hours', label: 'Hours', type: 'number', required: true, min: 0.25, max: 24, step: 0.25,
  },
  {
    name: 'deliverable_id', label: 'Deliverable', type: 'select', options: deliverables,
  },
  { name: 'note', label: 'What did you work on?', type: 'textarea' },
];

/** Hours logged on this project. Employees see their own entries; managers see everyone's. */
export default function TimeTab({ project, onChange, notify }) {
  const { user, atLeast } = useAuth();
  const entries = useApi('/time-entries', { project_id: project.id });
  const deliverables = useApi(`/projects/${project.id}/deliverables`);
  const [open, setOpen] = useState(false);
  const active = project.status === 'active' && !project.is_archived;
  const options = (deliverables.data?.items || []).map((d) => ({ value: d.id, label: `#${d.seq_no} ${d.name}` }));
  const total = (entries.data?.items || []).reduce((sum, e) => sum + Number(e.hours), 0);

  return (
    <Paper variant="outlined">
      <Box sx={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2, gap: 1, flexWrap: 'wrap',
      }}
      >
        <Box>
          <Typography variant="h3" component="h3">{atLeast('manager') ? 'Time logged' : 'Your time on this project'}</Typography>
          <Typography variant="body2" color="text.secondary">{`${total} hours in the latest entries`}</Typography>
        </Box>
        {active && <Button startIcon={<AddIcon />} variant="contained" onClick={() => setOpen(true)}>Log time</Button>}
      </Box>
      {entries.loading && <Loading />}
      {entries.error && <ErrorState error={entries.error} onRetry={entries.reload} />}
      {entries.data && entries.data.items.length === 0 && <EmptyState title="No time logged yet" hint={active ? 'Log hours as you work so the project can track effort against plan.' : ''} />}
      {entries.data && entries.data.items.length > 0 && (
        <TableContainer>
          <Table aria-label="Time entries">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Person</TableCell>
                <TableCell>Deliverable</TableCell>
                <TableCell align="right">Hours</TableCell>
                <TableCell align="right"><span className="sr-only">Actions</span></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.data.items.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{formatDate(e.work_date)}</TableCell>
                  <TableCell>
                    {e.user_name}
                    {e.note && <Typography variant="body2" color="text.secondary">{e.note}</Typography>}
                  </TableCell>
                  <TableCell>{e.deliverable_name || '—'}</TableCell>
                  <TableCell align="right">{e.hours}</TableCell>
                  <TableCell align="right">
                    {(e.user_id === user.id || project.can_manage) && (
                      <IconButton
                        aria-label={`Delete ${e.hours} hours on ${formatDate(e.work_date)}`}
                        onClick={async () => { await api.del(`/time-entries/${e.id}`); notify('Time entry deleted.'); entries.reload(); onChange(); }}
                      >
                        <DeleteOutline />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <FormDialog
        open={open}
        title="Log time"
        submitLabel="Log time"
        fields={timeFields(options)}
        initial={{ work_date: today() }}
        onClose={() => setOpen(false)}
        onSubmit={async (values) => {
          await api.post('/time-entries', { ...values, project_id: project.id });
          notify('Time logged.');
          entries.reload();
          onChange();
        }}
      />
    </Paper>
  );
}
TimeTab.propTypes = {
  project: PropTypes.shape({
    id: PropTypes.string, status: PropTypes.string, is_archived: PropTypes.bool, can_manage: PropTypes.bool,
  }).isRequired,
  onChange: PropTypes.func.isRequired,
  notify: PropTypes.func.isRequired,
};
