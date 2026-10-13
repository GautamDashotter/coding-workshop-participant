import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Chip, Link, Paper, Stack, TextField, Typography,
} from '@mui/material';
import useApi from '../hooks/useApi';
import PageHeader from '../components/PageHeader';
import { EmptyState, ErrorState, Loading } from '../components/Feedback';
import { formatDate, today } from '../utils/format';
import { palette } from '../theme';

const STATUS = {
  over_allocated: { label: 'Over-allocated', color: 'error' },
  allocated: { label: 'Allocated', color: 'default' },
  available: { label: 'Has capacity', color: 'success' },
};

/** Workload on a given day: who is stretched across projects, and who has room. */
export default function ResourcesPage() {
  const [date, setDate] = useState(today());
  const {
    data, loading, error, reload,
  } = useApi('/reports/resources', { date });

  return (
    <>
      <PageHeader
        title="Workload"
        summary={data ? `${data.over_allocated} over-allocated and ${data.available} with spare capacity on ${formatDate(date)}.` : null}
        actions={(
          <TextField
            type="date"
            label="On date"
            value={date}
            onChange={(e) => setDate(e.target.value || today())}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ width: 180 }}
          />
        )}
      />
      {loading && <Loading />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.items.length === 0 && (
        <Paper variant="outlined"><EmptyState title="Nobody to show" hint="People appear once they are on your teams or allocated to your projects." /></Paper>
      )}
      {data && data.items.length > 0 && (
        <Paper variant="outlined" sx={{ px: 2.5 }}>
          {data.items.map((p, i) => {
            const width = Math.min(p.total_percent, 150) / 1.5;
            return (
              <Box key={p.id} sx={{ py: 2, borderTop: i ? `1px solid ${palette.rule}` : 0 }}>
                <Box sx={{
                  display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', alignItems: 'baseline',
                }}
                >
                  <Box>
                    <Typography variant="subtitle2" component="h2">{p.name}</Typography>
                    <Typography variant="body2" color="text.secondary">{[p.job_title, p.team_name].filter(Boolean).join(', ')}</Typography>
                  </Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="subtitle2" color={p.total_percent > 100 ? 'error' : 'text.primary'}>{`${p.total_percent}%`}</Typography>
                    <Chip size="small" label={STATUS[p.status].label} color={STATUS[p.status].color} variant={p.status === 'allocated' ? 'outlined' : 'filled'} />
                  </Stack>
                </Box>
                <Box
                  role="img"
                  aria-label={`${p.total_percent}% allocated`}
                  sx={{
                    position: 'relative', height: 10, bgcolor: palette.rule, borderRadius: 5, mt: 1, overflow: 'hidden',
                  }}
                >
                  <Box sx={{
                    width: `${width}%`, height: '100%', bgcolor: p.total_percent > 100 ? palette.highRisk : palette.blueprint,
                  }}
                  />
                  <Box sx={{
                    position: 'absolute', left: `${100 / 1.5}%`, top: 0, bottom: 0, width: 2, bgcolor: palette.ink,
                  }}
                  />
                </Box>
                {p.projects.length > 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                    {p.projects.map((x, j) => (
                      <span key={x.project_id}>
                        {j > 0 && ', '}
                        <Link component={RouterLink} to={`/projects/${x.project_id}`} color="inherit">{x.project_name}</Link>
                        {` ${x.percent}%`}
                      </span>
                    ))}
                  </Typography>
                )}
              </Box>
            );
          })}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', pb: 1.5 }}>
            The dark mark is 100% of a person’s time. Bars past it mean the person is booked on more work than they have hours for.
          </Typography>
        </Paper>
      )}
    </>
  );
}
