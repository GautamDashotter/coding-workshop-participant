import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Breadcrumbs, Button, Link, Paper, Tab, Tabs, Typography,
} from '@mui/material';
import useApi from '../hooks/useApi';
import useOptions from '../hooks/useOptions';
import useNotice from '../hooks/useNotice';
import { useAuth } from '../auth/useAuth';
import { api } from '../services/api';
import RiskChip from '../components/RiskChip';
import ScheduleRail from '../components/ScheduleRail';
import FormDialog from '../components/FormDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import { ErrorState, Loading } from '../components/Feedback';
import {
  daysLabel, formatDate, formatMoney, formatPct,
} from '../utils/format';
import { projectFields } from './projectFields';
import DeliverablesTab from './project/DeliverablesTab';
import PeopleTab from './project/PeopleTab';
import TimeTab from './project/TimeTab';
import BudgetTab from './project/BudgetTab';

const Fact = ({ label, value }) => (
  <Box>
    <Typography variant="body2" color="text.secondary">{label}</Typography>
    <Typography variant="h3" component="p">{value}</Typography>
  </Box>
);
Fact.propTypes = { label: PropTypes.string.isRequired, value: PropTypes.node.isRequired };

/** One project: health, deliverables and their dependencies, people, time and budget. */
export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { atLeast } = useAuth();
  const isAdmin = atLeast('admin');
  const [tab, setTab] = useState(0);
  const [dialog, setDialog] = useState(null);
  const [notice, notify] = useNotice();
  const {
    data: project, loading, error, reload,
  } = useApi(`/projects/${id}`);
  const managers = useOptions(isAdmin ? 'managers' : null);

  if (loading && !project) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={error.status === 404 ? null : reload} />;

  const h = project.health;
  const canManage = project.can_manage;
  const closed = project.is_archived || project.status !== 'active';

  return (
    <>
      <Breadcrumbs sx={{ mb: 1 }}>
        <Link component={RouterLink} to="/projects" underline="hover" color="inherit">Projects</Link>
        <Typography color="text.primary">{project.name}</Typography>
      </Breadcrumbs>
      <Box sx={{
        display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start',
      }}
      >
        <Box sx={{ maxWidth: 720 }}>
          <Typography variant="h1" component="h1">{project.name}</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {`${formatDate(project.start_date)} to ${formatDate(project.end_date)}. Managed by ${project.manager_name}.`}
          </Typography>
          {project.description && <Typography sx={{ mt: 1 }}>{project.description}</Typography>}
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {canManage && <Button variant="outlined" onClick={() => setDialog('edit')}>Edit project</Button>}
          {canManage && <Button variant="outlined" color="success" onClick={() => setDialog('complete')}>Mark completed</Button>}
          {isAdmin && !closed && <Button color="error" onClick={() => setDialog('abandon')}>Abandon</Button>}
          {isAdmin && !project.is_archived && <Button color="error" onClick={() => setDialog('archive')}>Archive</Button>}
          {isAdmin && project.is_archived && <Button variant="contained" onClick={() => setDialog('restore')}>Restore</Button>}
        </Box>
      </Box>

      {closed && (
        <Alert severity="info" sx={{ mt: 2 }}>
          {`This project is ${project.status === 'active' ? 'archived' : project.status} and read-only.`}
          {isAdmin ? ' Restore it to make changes.' : ''}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 2.5, mt: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <RiskChip level={h.level} />
          <Typography variant="body2" color={h.days_remaining < 0 ? 'error' : 'text.secondary'}>{daysLabel(h.days_remaining)}</Typography>
        </Box>
        <ScheduleRail elapsedPct={h.time_elapsed_pct} completionPct={h.completion_pct} level={h.level} height={12} />
        {h.reasons.length > 0 && (
          <Typography variant="body2" color={h.level === 'high_risk' ? 'error' : 'warning.dark'}>{h.reasons.join('. ')}</Typography>
        )}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2, mt: 2 }}>
          <Fact label="Deliverables done" value={`${project.deliverables_done} of ${project.deliverables_total}`} />
          <Fact label="Time elapsed" value={formatPct(h.time_elapsed_pct)} />
          <Fact label="Budget spent" value={`${formatMoney(project.budget_spent)} (${formatPct(h.budget_used_pct)})`} />
          <Fact label="Hours logged" value={`${project.hours_logged} of ${project.allocated_hours}`} />
        </Box>
      </Paper>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" sx={{ mt: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Deliverables" />
        <Tab label="Team and workload" />
        <Tab label="Time" />
        <Tab label="Budget" />
      </Tabs>
      <Box sx={{ pt: 2 }}>
        {tab === 0 && <DeliverablesTab project={project} canManage={canManage} onChange={reload} notify={notify} />}
        {tab === 1 && <PeopleTab project={project} canManage={canManage} onChange={reload} notify={notify} />}
        {tab === 2 && <TimeTab project={project} onChange={reload} notify={notify} />}
        {tab === 3 && <BudgetTab project={project} canManage={canManage} onChange={reload} notify={notify} />}
      </Box>

      <FormDialog
        open={dialog === 'edit'}
        title="Edit project"
        submitLabel="Save changes"
        fields={projectFields(isAdmin ? managers : [{ value: project.manager_id, label: project.manager_name }], { isAdmin })}
        initial={project}
        onClose={() => setDialog(null)}
        onSubmit={async (values) => {
          await api.put(`/projects/${id}`, values);
          notify('Project saved.');
          reload();
        }}
      />
      <ConfirmDialog
        open={dialog === 'complete'}
        title="Mark project completed?"
        message="Completed projects close and move to the archive. All deliverables must be completed first."
        confirmLabel="Mark completed"
        onClose={() => setDialog(null)}
        onConfirm={async () => { await api.post(`/projects/${id}/status`, { status: 'completed' }); navigate('/projects'); }}
      />
      <ConfirmDialog
        open={dialog === 'abandon'}
        title="Abandon this project?"
        message="The project closes and moves to the archive. You can restore it later."
        confirmLabel="Abandon project"
        danger
        onClose={() => setDialog(null)}
        onConfirm={async () => { await api.post(`/projects/${id}/status`, { status: 'abandoned' }); reload(); }}
      />
      <ConfirmDialog
        open={dialog === 'archive'}
        title="Archive this project?"
        message="Managers and employees will no longer see it. You can restore it from the projects list."
        confirmLabel="Archive project"
        danger
        onClose={() => setDialog(null)}
        onConfirm={async () => { await api.del(`/projects/${id}`); reload(); }}
      />
      <ConfirmDialog
        open={dialog === 'restore'}
        title="Restore this project?"
        message="The project reopens as active and becomes visible to its manager and teams."
        confirmLabel="Restore project"
        onClose={() => setDialog(null)}
        onConfirm={async () => { await api.post(`/projects/${id}/restore`); notify('Project restored.'); reload(); }}
      />
      {notice}
    </>
  );
}
