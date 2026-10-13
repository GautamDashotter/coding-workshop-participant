import { useState } from 'react';
import PropTypes from 'prop-types';
import {
  Box, Button, IconButton, LinearProgress, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import useApi from '../../hooks/useApi';
import { api } from '../../services/api';
import FormDialog from '../../components/FormDialog';
import { EmptyState, ErrorState, Loading } from '../../components/Feedback';
import { formatDate, formatMoney, today } from '../../utils/format';

const CATEGORIES = ['labor', 'software', 'hardware', 'services', 'travel', 'other']
  .map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1) }));

/** Spend against plan, by category and line item. */
export default function BudgetTab({
  project, canManage, onChange, notify,
}) {
  const { data, loading, error, reload } = useApi(`/projects/${project.id}/expenses`);
  const [open, setOpen] = useState(false);
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const budget = Number(data.budget || 0);
  const spent = Number(data.spent || 0);
  const pct = budget ? (spent / budget) * 100 : 0;
  const color = pct > 100 ? 'error' : pct > 90 ? 'warning' : 'success';
  const refresh = () => { reload(); onChange(); };

  return (
    <Stack spacing={3}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h3" component="h3">
          {budget ? `${formatMoney(spent)} spent of ${formatMoney(budget)}` : `${formatMoney(spent)} spent, no budget set`}
        </Typography>
        {budget > 0 && (
          <>
            <LinearProgress variant="determinate" value={Math.min(pct, 100)} color={color} sx={{ height: 10, borderRadius: 5, my: 1.5 }} />
            <Typography variant="body2" color={pct > 100 ? 'error' : 'text.secondary'}>
              {pct > 100 ? `Over budget by ${formatMoney(spent - budget)}.` : `${formatMoney(budget - spent)} remaining (${Math.round(pct)}% used).`}
            </Typography>
          </>
        )}
        {data.by_category.length > 0 && (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 2, mt: 2 }}>
            {data.by_category.map((c) => (
              <Box key={c.category}>
                <Typography variant="body2" color="text.secondary" sx={{ textTransform: 'capitalize' }}>{c.category}</Typography>
                <Typography variant="subtitle2">{formatMoney(c.total)}</Typography>
              </Box>
            ))}
          </Box>
        )}
      </Paper>

      <Paper variant="outlined">
        <Box sx={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2, gap: 1, flexWrap: 'wrap',
        }}
        >
          <Typography variant="h3" component="h3">Expenses</Typography>
          {canManage && <Button startIcon={<AddIcon />} variant="contained" onClick={() => setOpen(true)}>Record expense</Button>}
        </Box>
        {data.items.length === 0 ? (
          <EmptyState title="No expenses recorded" hint={canManage ? 'Record spend as it happens to keep the budget picture current.' : ''} />
        ) : (
          <TableContainer>
            <Table aria-label="Expenses">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  {canManage && <TableCell align="right"><span className="sr-only">Actions</span></TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {data.items.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{formatDate(e.spent_on)}</TableCell>
                    <TableCell sx={{ textTransform: 'capitalize' }}>{e.category}</TableCell>
                    <TableCell>{e.description || '—'}</TableCell>
                    <TableCell align="right">{formatMoney(e.amount)}</TableCell>
                    {canManage && (
                      <TableCell align="right">
                        <IconButton
                          aria-label={`Delete ${formatMoney(e.amount)} expense`}
                          onClick={async () => { await api.del(`/expenses/${e.id}`); notify('Expense deleted.'); refresh(); }}
                        >
                          <DeleteOutline />
                        </IconButton>
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
        open={open}
        title="Record expense"
        submitLabel="Record expense"
        fields={[
          {
            name: 'category', label: 'Category', type: 'select', required: true, options: CATEGORIES,
          },
          {
            name: 'amount', label: 'Amount (USD)', type: 'number', required: true, min: 0.01, step: 0.01,
          },
          { name: 'spent_on', label: 'Date', type: 'date', required: true },
          { name: 'description', label: 'Description' },
        ]}
        initial={{ spent_on: today() }}
        onClose={() => setOpen(false)}
        onSubmit={async (values) => { await api.post(`/projects/${project.id}/expenses`, values); notify('Expense recorded.'); refresh(); }}
      />
    </Stack>
  );
}
BudgetTab.propTypes = {
  project: PropTypes.shape({ id: PropTypes.string }).isRequired,
  canManage: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
  notify: PropTypes.func.isRequired,
};
