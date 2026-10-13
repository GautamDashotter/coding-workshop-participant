import { useState } from 'react';
import PropTypes from 'prop-types';
import {
  Box, Button, Chip, IconButton, LinearProgress, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlined from '@mui/icons-material/EditOutlined';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import useApi from '../../hooks/useApi';
import useOptions from '../../hooks/useOptions';
import { useAuth } from '../../auth/useAuth';
import { api } from '../../services/api';
import FormDialog from '../../components/FormDialog';
import ConfirmDialog from '../../components/ConfirmDialog';
import { EmptyState, ErrorState, Loading } from '../../components/Feedback';
import { formatDate } from '../../utils/format';

const allocationFields = (people, editing) => [
  {
    name: 'user_id', label: 'Person', type: 'select', required: true, options: people, readOnly: editing,
  },
  {
    name: 'allocation_percent', label: 'Share of their time (%)', type: 'number', required: true, min: 1, max: 100,
  },
  { name: 'start_date', label: 'From', type: 'date', required: true },
  { name: 'end_date', label: 'Until', type: 'date', required: true },
  { name: 'role_on_project', label: 'Role on this project' },
];

/** Assigned teams and planned allocation of each person's time. */
export default function PeopleTab({
  project, canManage, onChange, notify,
}) {
  const { atLeast } = useAuth();
  const allocations = useApi('/allocations', { project_id: project.id });
  const people = useOptions('projectPeople', project.id);
  const teamOptions = useOptions(canManage ? (atLeast('admin') ? 'teams' : 'myTeams') : null);
  const [dialog, setDialog] = useState(null);

  const assigned = new Set(project.teams.map((t) => t.id));
  const current = dialog?.item;

  return (
    <Stack spacing={3}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Box sx={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap',
        }}
        >
          <Typography variant="h3" component="h3">Teams on this project</Typography>
          {canManage && <Button startIcon={<AddIcon />} onClick={() => setDialog({ kind: 'team' })}>Assign team</Button>}
        </Box>
        <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', rowGap: 1 }}>
          {project.teams.length === 0 && <Typography variant="body2" color="text.secondary">No teams assigned. Team members can only see projects their team is on.</Typography>}
          {project.teams.map((t) => (
            <Chip
              key={t.id}
              label={t.name}
              onDelete={canManage ? () => setDialog({ kind: 'unassign', item: t }) : undefined}
            />
          ))}
        </Stack>
      </Paper>

      <Paper variant="outlined">
        <Box sx={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2, gap: 1, flexWrap: 'wrap',
        }}
        >
          <Box>
            <Typography variant="h3" component="h3">Planned allocation</Typography>
            <Typography variant="body2" color="text.secondary">How much of each person’s time this project expects.</Typography>
          </Box>
          {canManage && (
            <Button startIcon={<AddIcon />} variant="contained" disabled={!people.length} onClick={() => setDialog({ kind: 'allocate' })}>
              Allocate person
            </Button>
          )}
        </Box>
        {allocations.loading && <Loading />}
        {allocations.error && <ErrorState error={allocations.error} onRetry={allocations.reload} />}
        {allocations.data && allocations.data.items.length === 0 && (
          <EmptyState title="Nobody allocated yet" hint={people.length ? 'Allocate people from the assigned teams.' : 'Assign a team first, then allocate its members.'} />
        )}
        {allocations.data && allocations.data.items.length > 0 && (
          <TableContainer>
            <Table aria-label="Allocations">
              <TableHead>
                <TableRow>
                  <TableCell>Person</TableCell>
                  <TableCell sx={{ minWidth: 160 }}>Share of time</TableCell>
                  <TableCell>Period</TableCell>
                  {canManage && <TableCell align="right">Actions</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {allocations.data.items.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      {a.user_name}
                      {a.role_on_project && <Typography variant="body2" color="text.secondary">{a.role_on_project}</Typography>}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{`${a.allocation_percent}%`}</Typography>
                      <LinearProgress variant="determinate" value={a.allocation_percent} sx={{ height: 6, borderRadius: 3 }} />
                    </TableCell>
                    <TableCell>{`${formatDate(a.start_date)} to ${formatDate(a.end_date)}`}</TableCell>
                    {canManage && (
                      <TableCell align="right">
                        <IconButton aria-label={`Edit allocation for ${a.user_name}`} onClick={() => setDialog({ kind: 'edit', item: a })}><EditOutlined /></IconButton>
                        <IconButton aria-label={`Remove allocation for ${a.user_name}`} onClick={() => setDialog({ kind: 'delete', item: a })}><DeleteOutline /></IconButton>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <FormDialog
        open={dialog?.kind === 'team'}
        title="Assign a team"
        submitLabel="Assign team"
        fields={[{
          name: 'team_id', label: 'Team', type: 'select', required: true,
          options: teamOptions.filter((t) => !assigned.has(t.value)),
          help: atLeast('admin') ? '' : 'Managers can assign the teams they manage.',
        }]}
        onClose={() => setDialog(null)}
        onSubmit={async (values) => { await api.post(`/projects/${project.id}/teams`, values); notify('Team assigned.'); onChange(); }}
      />
      <FormDialog
        open={dialog?.kind === 'allocate' || dialog?.kind === 'edit'}
        title={dialog?.kind === 'edit' ? `Edit ${current?.user_name}’s allocation` : 'Allocate a person'}
        submitLabel={dialog?.kind === 'edit' ? 'Save changes' : 'Allocate'}
        fields={allocationFields(people, dialog?.kind === 'edit')}
        initial={current || { start_date: project.start_date, end_date: project.end_date, allocation_percent: 50 }}
        onClose={() => setDialog(null)}
        onSubmit={async (values) => {
          const saved = dialog.kind === 'edit'
            ? await api.put(`/allocations/${current.id}`, { ...values, user_id: undefined })
            : await api.post('/allocations', { ...values, project_id: project.id });
          if (saved.warning) notify(saved.warning, 'warning');
          else notify('Allocation saved.');
          allocations.reload();
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === 'unassign'}
        title={`Remove ${current?.name} from this project?`}
        message="Its members will no longer see this project unless another of their teams is assigned."
        confirmLabel="Remove team"
        danger
        onClose={() => setDialog(null)}
        onConfirm={async () => { await api.del(`/projects/${project.id}/teams/${current.id}`); notify('Team removed.'); onChange(); }}
      />
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        title={`Remove ${current?.user_name}’s allocation?`}
        message="Their planned time on this project is cleared. Logged hours are kept."
        confirmLabel="Remove allocation"
        danger
        onClose={() => setDialog(null)}
        onConfirm={async () => { await api.del(`/allocations/${current.id}`); notify('Allocation removed.'); allocations.reload(); }}
      />
    </Stack>
  );
}
PeopleTab.propTypes = {
  project: PropTypes.shape({
    id: PropTypes.string, start_date: PropTypes.string, end_date: PropTypes.string, teams: PropTypes.arrayOf(PropTypes.shape({})),
  }).isRequired,
  canManage: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
  notify: PropTypes.func.isRequired,
};
