import { useState } from 'react';
import PropTypes from 'prop-types';
import {
  Accordion, AccordionDetails, AccordionSummary, Box, Button, Paper, Stack, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import useApi from '../hooks/useApi';
import useOptions from '../hooks/useOptions';
import useNotice from '../hooks/useNotice';
import { useAuth } from '../auth/useAuth';
import { api } from '../services/api';
import PageHeader from '../components/PageHeader';
import FormDialog from '../components/FormDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import { EmptyState, ErrorState, Loading } from '../components/Feedback';

function Members({ teamId }) {
  const { data, loading } = useApi(`/teams/${teamId}`);
  if (loading) return <Loading />;
  if (!data?.members.length) return <Typography variant="body2" color="text.secondary">No members yet. Admins add people to teams from People.</Typography>;
  return (
    <Box component="ul" sx={{ m: 0, pl: 2 }}>
      {data.members.map((m) => (
        <li key={m.id}>
          <Typography variant="body2">{`${m.first_name} ${m.last_name}${m.job_title ? `, ${m.job_title}` : ''}`}</Typography>
        </li>
      ))}
    </Box>
  );
}
Members.propTypes = { teamId: PropTypes.string.isRequired };

/** Teams directory. Managers create and edit their own teams; admins manage all. */
export default function TeamsPage() {
  const { user, atLeast } = useAuth();
  const isAdmin = atLeast('admin');
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [notice, notify] = useNotice();
  const {
    data, loading, error, reload,
  } = useApi('/teams', { search });
  const managers = useOptions(isAdmin ? 'managers' : null);
  const current = dialog?.item;

  const fields = [
    { name: 'name', label: 'Team name', required: true },
    { name: 'department', label: 'Department' },
    ...(isAdmin ? [{
      name: 'manager_id', label: 'Manager', type: 'select', required: true, options: managers,
    }] : []),
  ];

  return (
    <>
      <PageHeader
        title="Teams"
        summary="A team is a group of people. Teams are assigned to projects, which is how members see their work."
        actions={atLeast('manager') && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ kind: 'create' })}>Create team</Button>
        )}
      />
      <TextField label="Search teams" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ mb: 2, maxWidth: 360 }} />
      {loading && <Loading />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.items.length === 0 && <Paper variant="outlined"><EmptyState title="No teams found" /></Paper>}
      {data && data.items.length > 0 && (
        <Stack spacing={1}>
          {data.items.map((t) => {
            const canEdit = isAdmin || t.manager_id === user.id;
            return (
              <Accordion key={t.id} variant="outlined" disableGutters expanded={expanded === t.id} onChange={(_, open) => setExpanded(open ? t.id : null)}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle2" component="h2">{t.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {`${t.member_count} member${t.member_count === 1 ? '' : 's'}. Managed by ${t.manager_name || 'nobody'}${t.department ? `. ${t.department}` : ''}.`}
                    </Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  {expanded === t.id && <Members teamId={t.id} />}
                  {canEdit && (
                    <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                      <Button size="small" variant="outlined" onClick={() => setDialog({ kind: 'edit', item: t })}>Edit team</Button>
                      {isAdmin && <Button size="small" color="error" onClick={() => setDialog({ kind: 'archive', item: t })}>Archive team</Button>}
                    </Stack>
                  )}
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Stack>
      )}
      <FormDialog
        open={dialog?.kind === 'create' || dialog?.kind === 'edit'}
        title={dialog?.kind === 'edit' ? 'Edit team' : 'Create team'}
        submitLabel={dialog?.kind === 'edit' ? 'Save changes' : 'Create team'}
        fields={fields}
        initial={current}
        onClose={() => setDialog(null)}
        onSubmit={async (values) => {
          if (dialog.kind === 'edit') await api.put(`/teams/${current.id}`, values);
          else await api.post('/teams', values);
          notify(dialog.kind === 'edit' ? 'Team saved.' : 'Team created.');
          reload();
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === 'archive'}
        title={`Archive ${current?.name}?`}
        message="Teams with members cannot be archived. Move its people to another team first."
        confirmLabel="Archive team"
        danger
        onClose={() => setDialog(null)}
        onConfirm={async () => { await api.del(`/teams/${current.id}`); notify('Team archived.'); reload(); }}
      />
      {notice}
    </>
  );
}
