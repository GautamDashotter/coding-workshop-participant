import PropTypes from 'prop-types';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Chip, Divider, Link, Paper, Stack, Typography,
} from '@mui/material';
import useApi from '../hooks/useApi';
import { useAuth } from '../auth/useAuth';
import PageHeader from '../components/PageHeader';
import RiskChip from '../components/RiskChip';
import ScheduleRail from '../components/ScheduleRail';
import { EmptyState, ErrorState, Loading } from '../components/Feedback';
import {
  daysLabel, formatDate, formatMoney, formatPct, today,
} from '../utils/format';

const ORDER = { high_risk: 0, at_risk: 1, on_track: 2 };

function ProjectRow({ project }) {
  const h = project.health;
  return (
    <Box sx={{ py: 2 }}>
      <Box sx={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 2, flexWrap: 'wrap',
      }}
      >
        <Link component={RouterLink} to={`/projects/${project.id}`} underline="hover" color="inherit" variant="h3">
          {project.name}
        </Link>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="body2" color={h.days_remaining < 0 ? 'error' : 'text.secondary'}>
            {daysLabel(h.days_remaining)}
          </Typography>
          <RiskChip level={h.level} reasons={h.reasons} />
        </Stack>
      </Box>
      <ScheduleRail elapsedPct={h.time_elapsed_pct} completionPct={h.completion_pct} level={h.level} />
      <Box sx={{
        display: 'flex', columnGap: 3, rowGap: 0.5, flexWrap: 'wrap', color: 'text.secondary', fontSize: '0.875rem',
      }}
      >
        <span>{`${project.deliverables_done} of ${project.deliverables_total} deliverables done`}</span>
        <span>{`Budget ${formatMoney(project.budget_spent)} of ${formatMoney(project.budget)} (${formatPct(h.budget_used_pct)})`}</span>
        <span>{`${project.manager_name}`}</span>
      </Box>
      {h.reasons.length > 0 && (
        <Typography variant="body2" sx={{ mt: 0.75 }} color={h.level === 'high_risk' ? 'error' : 'warning.dark'}>
          {h.reasons.join('. ')}
        </Typography>
      )}
    </Box>
  );
}
ProjectRow.propTypes = { project: PropTypes.shape({}).isRequired };

function Workload() {
  const { data } = useApi('/reports/resources');
  if (!data) return null;
  const over = data.items.filter((p) => p.status === 'over_allocated');
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="h3" component="h2">Over-allocated people</Typography>
      {over.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Nobody is above 100% today.</Typography>
      ) : over.map((p) => (
        <Box key={p.id} sx={{ mt: 1.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="subtitle2">{p.name}</Typography>
            <Typography variant="subtitle2" color="error">{`${p.total_percent}%`}</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            {p.projects.map((x) => `${x.project_name} ${x.percent}%`).join(', ')}
          </Typography>
        </Box>
      ))}
      <Link component={RouterLink} to="/resources" sx={{ display: 'inline-block', mt: 2 }}>See everyone’s workload</Link>
    </Paper>
  );
}

/** Portfolio overview: answers "what is the status, what is at risk, what is due". */
export default function DashboardPage() {
  const { user, atLeast } = useAuth();
  const {
    data, loading, error, reload,
  } = useApi('/reports/dashboard');

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const needAttention = data.risk_counts.at_risk + data.risk_counts.high_risk;
  const projects = [...data.projects].sort((a, b) => ORDER[a.health.level] - ORDER[b.health.level]);
  const summary = data.active_projects === 0
    ? 'No active projects yet.'
    : `${needAttention} of ${data.active_projects} active projects need attention. `
      + `${formatMoney(data.budget_spent)} spent of ${formatMoney(data.budget_total)} budgeted.`;

  return (
    <>
      <PageHeader title={`Good to see you, ${user.first_name}`} summary={summary} />
      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
        <Chip label={`${data.risk_counts.high_risk} high risk`} color="error" />
        <Chip label={`${data.risk_counts.at_risk} at risk`} color="warning" />
        <Chip label={`${data.risk_counts.on_track} on track`} color="success" variant="outlined" />
      </Stack>
      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 2fr) minmax(280px, 1fr)' } }}>
        <Paper variant="outlined" sx={{ px: 2.5 }}>
          {projects.length === 0 ? (
            <EmptyState
              title="No active projects to show"
              hint={atLeast('admin') ? 'Create a project to start tracking it.' : 'Projects appear here once your team is assigned to one.'}
            />
          ) : projects.map((p, i) => (
            <Box key={p.id}>
              {i > 0 && <Divider />}
              <ProjectRow project={p} />
            </Box>
          ))}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', pb: 1.5 }}>
            The bar shows deliverables completed; the dark mark is today. A striped gap means work is behind the clock.
          </Typography>
        </Paper>
        <Stack spacing={3}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h3" component="h2">Due in the next two weeks</Typography>
            {data.upcoming_deliverables.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Nothing due soon.</Typography>
            ) : data.upcoming_deliverables.map((d) => (
              <Box key={d.id} sx={{ mt: 1.5 }}>
                <Link component={RouterLink} to={`/projects/${d.project_id}`} underline="hover" color="inherit">
                  <Typography variant="subtitle2">{`#${d.seq_no} ${d.name}`}</Typography>
                </Link>
                <Typography variant="body2" color="text.secondary">
                  {`${d.project_name}, ${d.end_date < today() ? 'overdue since' : 'due'} ${formatDate(d.end_date)}`}
                </Typography>
              </Box>
            ))}
          </Paper>
          {atLeast('manager') && <Workload />}
        </Stack>
      </Box>
    </>
  );
}
