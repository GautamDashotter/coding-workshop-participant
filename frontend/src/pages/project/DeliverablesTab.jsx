import { useState } from 'react';
import PropTypes from 'prop-types';
import {
  Box, Button, Chip, IconButton, Menu, MenuItem, Paper, Stack, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import useApi from '../../hooks/useApi';
import useOptions from '../../hooks/useOptions';
import { api } from '../../services/api';
import FormDialog from '../../components/FormDialog';
import ConfirmDialog from '../../components/ConfirmDialog';
import { EmptyState, ErrorState, Loading } from '../../components/Feedback';
import { DELIVERABLE_STATUS, formatDate, today } from '../../utils/format';
import { palette } from '../../theme';

const fields = (people) => [
  { name: 'name', label: 'Deliverable', required: true },
  { name: 'goal', label: 'Goal', help: 'For example: decommission 200 servers.' },
  { name: 'deliverables', label: 'What will be handed over', type: 'textarea' },
  { name: 'start_date', label: 'Start date', type: 'date', required: true },
  { name: 'end_date', label: 'Due date', type: 'date', required: true },
  {
    name: 'status',
    label: 'Status',
    type: 'select',
    options: [{ value: 'planned', label: 'Planned' }, { value: 'in_progress', label: 'In progress' }],
  },
  { name: 'assignee_ids', label: 'Assigned people', type: 'multiselect', options: people },
];

/** Deliverables in sequence, their dependency chain, and what is blocked. */
export default function DeliverablesTab({
  project, canManage, onChange, notify,
}) {
  const list = useApi(`/projects/${project.id}/deliverables`);
  const graph = useApi(`/projects/${project.id}/dependency-graph`);
  const people = useOptions(canManage ? 'projectPeople' : null, project.id);
  const [dialog, setDialog] = useState(null);
  const [menu, setMenu] = useState(null);

  const refresh = () => { list.reload(); graph.reload(); onChange(); };
  if (list.loading || graph.loading) return <Loading />;
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />;

  const items = list.data.items;
  const bySeq = Object.fromEntries(items.map((d) => [d.id, d]));
  const blocked = new Set(graph.data?.blocked || []);
  const ordered = (graph.data?.order || []).map((id) => bySeq[id]).filter(Boolean);
  const current = dialog?.item;

  return (
    <>
      {canManage && (
        <Button startIcon={<AddIcon />} variant="contained" sx={{ mb: 2 }} onClick={() => setDialog({ kind: 'create' })}>
          Add deliverable
        </Button>
      )}
      {items.length === 0 ? (
        <Paper variant="outlined">
          <EmptyState title="No deliverables yet" hint={canManage ? 'Break the project into deliverables to track progress.' : 'The project manager has not added any yet.'} />
        </Paper>
      ) : (
        <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 3fr) minmax(240px, 1fr)' } }}>
          <Stack spacing={1.5}>
            {items.map((d) => {
              const late = d.status !== 'completed' && d.end_date < today();
              const isBlocked = blocked.has(d.id);
              return (
                <Paper key={d.id} variant="outlined" sx={{ p: 2, borderLeft: `4px solid ${d.status === 'completed' ? palette.onTrack : late ? palette.highRisk : palette.rule}` }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                    <Box>
                      <Typography variant="subtitle2" component="h3">{`#${d.seq_no} ${d.name}`}</Typography>
                      <Typography variant="body2" color={late ? 'error' : 'text.secondary'}>
                        {`${formatDate(d.start_date)} to ${formatDate(d.end_date)}${late ? ', overdue' : ''}`}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1} alignItems="flex-start">
                      <Chip size="small" label={DELIVERABLE_STATUS[d.status].label} color={DELIVERABLE_STATUS[d.status].color} />
                      {canManage && d.status !== 'completed' && (
                        <IconButton size="small" aria-label={`Actions for ${d.name}`} onClick={(e) => setMenu({ anchor: e.currentTarget, item: d })}>
                          <MoreVertIcon fontSize="small" />
                        </IconButton>
                      )}
                    </Stack>
                  </Box>
                  {d.goal && <Typography variant="body2" sx={{ mt: 1 }}>{d.goal}</Typography>}
                  <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', rowGap: 1 }} alignItems="center">
                    {d.depends_on.length > 0 && (
                      <Typography variant="body2" color={isBlocked ? 'warning.dark' : 'text.secondary'}>
                        {isBlocked ? 'Waiting on' : 'After'}
                      </Typography>
                    )}
                    {d.depends_on.map((depId) => bySeq[depId] && (
                      <Chip
                        key={depId}
                        size="small"
                        variant="outlined"
                        label={`#${bySeq[depId].seq_no} ${bySeq[depId].name}`}
                        onDelete={canManage && d.status !== 'completed' ? async () => {
                          await api.del(`/deliverables/${d.id}/dependencies/${depId}`);
                          notify('Dependency removed.');
                          refresh();
                        } : undefined}
                      />
                    ))}
                    {d.assignees.length > 0 && (
                      <Typography variant="body2" color="text.secondary">
                        {`Assigned: ${d.assignees.map((a) => a.name).join(', ')}`}
                      </Typography>
                    )}
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
          <Paper variant="outlined" sx={{ p: 2, alignSelf: 'start' }}>
            <Typography variant="h3" component="h3">Delivery order</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              The order the dependency chain allows. Items waiting on unfinished work are marked.
            </Typography>
            <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
              {ordered.map((d) => (
                <Box component="li" key={d.id} sx={{ mb: 0.75 }}>
                  <Typography variant="body2" sx={{ textDecoration: d.status === 'completed' ? 'line-through' : 'none' }}>
                    {`#${d.seq_no} ${d.name}`}
                    {blocked.has(d.id) && <Typography component="span" variant="body2" color="warning.dark">{' (blocked)'}</Typography>}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Paper>
        </Box>
      )}

      <Menu anchorEl={menu?.anchor} open={Boolean(menu)} onClose={() => setMenu(null)}>
        <MenuItem onClick={() => { setDialog({ kind: 'edit', item: menu.item }); setMenu(null); }}>Edit</MenuItem>
        <MenuItem onClick={() => { setDialog({ kind: 'dependency', item: menu.item }); setMenu(null); }}>Add dependency</MenuItem>
        <Tooltip title={blocked.has(menu?.item?.id) ? 'Finish its dependencies first' : ''} placement="left">
          <span>
            <MenuItem disabled={blocked.has(menu?.item?.id)} onClick={() => { setDialog({ kind: 'complete', item: menu.item }); setMenu(null); }}>
              Mark completed
            </MenuItem>
          </span>
        </Tooltip>
        <MenuItem sx={{ color: 'error.main' }} onClick={() => { setDialog({ kind: 'archive', item: menu.item }); setMenu(null); }}>Remove</MenuItem>
      </Menu>

      <FormDialog
        open={dialog?.kind === 'create' || dialog?.kind === 'edit'}
        title={dialog?.kind === 'edit' ? 'Edit deliverable' : 'Add deliverable'}
        submitLabel={dialog?.kind === 'edit' ? 'Save changes' : 'Add deliverable'}
        fields={fields(people)}
        initial={current ? { ...current, assignee_ids: current.assignees.map((a) => a.id) } : { start_date: project.start_date, end_date: project.end_date, status: 'planned' }}
        onClose={() => setDialog(null)}
        onSubmit={async (values) => {
          if (dialog.kind === 'edit') await api.put(`/deliverables/${current.id}`, values);
          else await api.post(`/projects/${project.id}/deliverables`, values);
          notify(dialog.kind === 'edit' ? 'Deliverable saved.' : 'Deliverable added.');
          refresh();
        }}
      />
      <FormDialog
        open={dialog?.kind === 'dependency'}
        title={`What must finish before #${current?.seq_no}?`}
        submitLabel="Add dependency"
        fields={[{
          name: 'depends_on_id',
          label: 'Deliverable',
          type: 'select',
          required: true,
          options: items.filter((d) => d.id !== current?.id && !current?.depends_on.includes(d.id))
            .map((d) => ({ value: d.id, label: `#${d.seq_no} ${d.name}` })),
        }]}
        onClose={() => setDialog(null)}
        onSubmit={async (values) => {
          await api.post(`/deliverables/${current.id}/dependencies`, values);
          notify('Dependency added.');
          refresh();
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === 'complete'}
        title={`Mark #${current?.seq_no} completed?`}
        message="Confirm the goal has been met. Completed deliverables become read-only."
        confirmLabel="Mark completed"
        onClose={() => setDialog(null)}
        onConfirm={async () => { await api.post(`/deliverables/${current.id}/complete`); notify('Deliverable completed.'); refresh(); }}
      />
      <ConfirmDialog
        open={dialog?.kind === 'archive'}
        title={`Remove #${current?.seq_no}?`}
        message="The deliverable and its dependency links are removed from the plan. Logged time is kept."
        confirmLabel="Remove deliverable"
        danger
        onClose={() => setDialog(null)}
        onConfirm={async () => { await api.del(`/deliverables/${current.id}`); notify('Deliverable removed.'); refresh(); }}
      />
    </>
  );
}
DeliverablesTab.propTypes = {
  project: PropTypes.shape({ id: PropTypes.string, start_date: PropTypes.string, end_date: PropTypes.string }).isRequired,
  canManage: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
  notify: PropTypes.func.isRequired,
};
