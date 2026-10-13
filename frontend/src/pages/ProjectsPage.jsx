import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Box, Button, Link, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useMediaQuery } from 'react-responsive';
import useApi from '../hooks/useApi';
import useOptions from '../hooks/useOptions';
import { useAuth } from '../auth/useAuth';
import { api } from '../services/api';
import PageHeader from '../components/PageHeader';
import RiskChip from '../components/RiskChip';
import ScheduleRail from '../components/ScheduleRail';
import FormDialog from '../components/FormDialog';
import { EmptyState, ErrorState, Loading } from '../components/Feedback';
import { formatDate, formatMoney, formatPct } from '../utils/format';
import { projectFields } from './projectFields';

/** Searchable, filterable project list. Admins can create projects and view closed ones. */
export default function ProjectsPage() {
  const { atLeast } = useAuth();
  const isAdmin = atLeast('admin');
  const navigate = useNavigate();
  const isWide = useMediaQuery({ minWidth: 900 });
  const [filters, setFilters] = useState({ search: '', status: '', risk: '' });
  const [creating, setCreating] = useState(false);
  const query = { ...filters, include_archived: isAdmin && filters.status ? 'true' : undefined };
  const {
    data, loading, error, reload,
  } = useApi('/projects', query);
  const managers = useOptions(isAdmin ? 'managers' : null);

  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));

  return (
    <>
      <PageHeader
        title="Projects"
        summary={data ? `${data.total} project${data.total === 1 ? '' : 's'} match.` : null}
        actions={isAdmin && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>Create project</Button>
        )}
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField label="Search by name or description" value={filters.search} onChange={set('search')} />
        <TextField select label="Health" value={filters.risk} onChange={set('risk')} sx={{ minWidth: 160 }}>
          <MenuItem value="">Any</MenuItem>
          <MenuItem value="high_risk">High risk</MenuItem>
          <MenuItem value="at_risk">At risk</MenuItem>
          <MenuItem value="on_track">On track</MenuItem>
        </TextField>
        {isAdmin && (
          <TextField select label="Status" value={filters.status} onChange={set('status')} sx={{ minWidth: 160 }}>
            <MenuItem value="">Open projects</MenuItem>
            <MenuItem value="active">Active (incl. archived)</MenuItem>
            <MenuItem value="completed">Completed</MenuItem>
            <MenuItem value="abandoned">Abandoned</MenuItem>
          </TextField>
        )}
      </Stack>

      {loading && <Loading />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.items.length === 0 && (
        <Paper variant="outlined">
          <EmptyState title="No projects match" hint="Clear the search or filters to see more." />
        </Paper>
      )}
      {data && data.items.length > 0 && (isWide ? (
        <TableContainer component={Paper} variant="outlined">
          <Table aria-label="Projects">
            <TableHead>
              <TableRow>
                <TableCell>Project</TableCell>
                <TableCell sx={{ width: 220 }}>Progress against time</TableCell>
                <TableCell>Ends</TableCell>
                <TableCell align="right">Budget used</TableCell>
                <TableCell>Health</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.items.map((p) => (
                <TableRow key={p.id} hover>
                  <TableCell>
                    <Link component={RouterLink} to={`/projects/${p.id}`} underline="hover" sx={{ fontWeight: 600 }}>{p.name}</Link>
                    <Typography variant="body2" color="text.secondary">{p.manager_name}</Typography>
                  </TableCell>
                  <TableCell>
                    <ScheduleRail elapsedPct={p.health.time_elapsed_pct} completionPct={p.health.completion_pct} level={p.health.level} />
                  </TableCell>
                  <TableCell>{formatDate(p.end_date)}</TableCell>
                  <TableCell align="right">
                    {formatPct(p.health.budget_used_pct)}
                    <Typography variant="body2" color="text.secondary">{formatMoney(p.budget)}</Typography>
                  </TableCell>
                  <TableCell>
                    <RiskChip level={p.is_archived && p.status === 'active' ? 'closed' : p.health.level} reasons={p.health.reasons} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Stack spacing={1.5}>
          {data.items.map((p) => (
            <Paper key={p.id} variant="outlined" sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                <Link component={RouterLink} to={`/projects/${p.id}`} underline="hover" sx={{ fontWeight: 600 }}>{p.name}</Link>
                <RiskChip level={p.health.level} reasons={p.health.reasons} />
              </Box>
              <ScheduleRail elapsedPct={p.health.time_elapsed_pct} completionPct={p.health.completion_pct} level={p.health.level} />
              <Typography variant="body2" color="text.secondary">
                {`Ends ${formatDate(p.end_date)}, ${formatPct(p.health.budget_used_pct)} of budget used`}
              </Typography>
            </Paper>
          ))}
        </Stack>
      ))}

      <FormDialog
        open={creating}
        title="Create project"
        submitLabel="Create project"
        fields={projectFields(managers, { isAdmin })}
        onClose={() => setCreating(false)}
        onSubmit={async (values) => {
          const project = await api.post('/projects', values);
          navigate(`/projects/${project.id}`);
        }}
      />
    </>
  );
}
