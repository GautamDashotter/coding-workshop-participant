import { useState } from 'react';
import {
  Button, Chip, IconButton, Menu, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import useApi from '../hooks/useApi';
import useOptions from '../hooks/useOptions';
import useNotice from '../hooks/useNotice';
import { api } from '../services/api';
import PageHeader from '../components/PageHeader';
import FormDialog from '../components/FormDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import { EmptyState, ErrorState, Loading } from '../components/Feedback';
import { formatMoney } from '../utils/format';

const ROLES = [
  { value: 'employee', label: 'Employee' }, { value: 'manager', label: 'Manager' }, { value: 'admin', label: 'Admin' },
];

const userFields = (teams, creating) => [
  { name: 'first_name', label: 'First name', required: true },
  { name: 'last_name', label: 'Last name', required: true },
  {
    name: 'email', label: 'Email', type: 'email', required: true,
  },
  ...(creating ? [{
    name: 'password', label: 'Temporary password', type: 'password', required: true, minLength: 8,
    help: 'Share it with the person; they can change it from their profile.',
  }] : []),
  {
    name: 'role', label: 'Role', type: 'select', required: true, options: ROLES,
  },
  {
    name: 'team_id', label: 'Team', type: 'select', options: teams, help: 'Required for employees.',
  },
  { name: 'job_title', label: 'Job title' },
  {
    name: 'salary', label: 'Salary (USD)', type: 'number', min: 0, help: 'Visible to admins only.',
  },
];

/** People directory and account management (admin only). */
export default function UsersPage() {
  const [filters, setFilters] = useState({ search: '', role: '', include_archived: '' });
  const [dialog, setDialog] = useState(null);
  const [menu, setMenu] = useState(null);
  const [notice, notify] = useNotice();
  const {
    data, loading, error, reload,
  } = useApi('/users', filters);
  const teams = useOptions('teams');
  const current = dialog?.item;
  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));

  const checkTeam = (values) => {
    if (values.role === 'employee' && !values.team_id) {
      const err = new Error('Employees must belong to a team.');
      err.fields = { team_id: 'Choose a team.' };
      throw err;
    }
  };

  return (
    <>
      <PageHeader
        title="People"
        summary={data ? `${data.total} account${data.total === 1 ? '' : 's'}.` : null}
        actions={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ kind: 'create' })}>Add person</Button>}
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField label="Search name, email or title" value={filters.search} onChange={set('search')} />
        <TextField select label="Role" value={filters.role} onChange={set('role')} sx={{ minWidth: 150 }}>
          <MenuItem value="">Any</MenuItem>
          {ROLES.map((r) => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
        </TextField>
        <TextField select label="Accounts" value={filters.include_archived} onChange={set('include_archived')} sx={{ minWidth: 170 }}>
          <MenuItem value="">Active only</MenuItem>
          <MenuItem value="true">Include archived</MenuItem>
        </TextField>
      </Stack>
      {loading && <Loading />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.items.length === 0 && <Paper variant="outlined"><EmptyState title="Nobody matches" hint="Clear the search to see everyone." /></Paper>}
      {data && data.items.length > 0 && (
        <TableContainer component={Paper} variant="outlined">
          <Table aria-label="People">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Username</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Team</TableCell>
                <TableCell align="right">Salary</TableCell>
                <TableCell align="right"><span className="sr-only">Actions</span></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.items.map((u) => (
                <TableRow key={u.id} sx={{ opacity: u.is_archived ? 0.55 : 1 }}>
                  <TableCell>
                    {`${u.first_name} ${u.last_name}`}
                    <Typography variant="body2" color="text.secondary">{u.email}</Typography>
                  </TableCell>
                  <TableCell>{u.username}</TableCell>
                  <TableCell>
                    <Chip size="small" label={u.role} sx={{ textTransform: 'capitalize' }} color={u.role === 'admin' ? 'primary' : 'default'} variant="outlined" />
                    {u.is_archived && <Chip size="small" label="Archived" sx={{ ml: 0.5 }} />}
                  </TableCell>
                  <TableCell>{u.team_name || '—'}</TableCell>
                  <TableCell align="right">{formatMoney(u.salary)}</TableCell>
                  <TableCell align="right">
                    <IconButton aria-label={`Actions for ${u.first_name} ${u.last_name}`} onClick={(e) => setMenu({ anchor: e.currentTarget, item: u })}>
                      <MoreVertIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <Menu anchorEl={menu?.anchor} open={Boolean(menu)} onClose={() => setMenu(null)}>
        {menu?.item.is_archived ? (
          <MenuItem onClick={() => { setDialog({ kind: 'restore', item: menu.item }); setMenu(null); }}>Restore account</MenuItem>
        ) : [
          <MenuItem key="edit" onClick={() => { setDialog({ kind: 'edit', item: menu.item }); setMenu(null); }}>Edit</MenuItem>,
          <MenuItem key="archive" sx={{ color: 'error.main' }} onClick={() => { setDialog({ kind: 'archive', item: menu.item }); setMenu(null); }}>Archive account</MenuItem>,
        ]}
      </Menu>
      <FormDialog
        open={dialog?.kind === 'create' || dialog?.kind === 'edit'}
        title={dialog?.kind === 'edit' ? `Edit ${current?.first_name} ${current?.last_name}` : 'Add person'}
        submitLabel={dialog?.kind === 'edit' ? 'Save changes' : 'Add person'}
        fields={userFields(teams, dialog?.kind === 'create')}
        initial={current || { role: 'employee' }}
        onClose={() => setDialog(null)}
        onSubmit={async (values) => {
          checkTeam(values);
          if (dialog.kind === 'edit') {
            await api.put(`/users/${current.id}`, values);
            notify('Changes saved.');
          } else {
            const created = await api.post('/users', values);
            notify(`Account created. Their username is ${created.username}.`);
          }
          reload();
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === 'archive'}
        title={`Archive ${current?.first_name} ${current?.last_name}?`}
        message="They will no longer be able to sign in. Their history is kept and you can restore the account."
        confirmLabel="Archive account"
        danger
        onClose={() => setDialog(null)}
        onConfirm={async () => { await api.del(`/users/${current.id}`); notify('Account archived.'); reload(); }}
      />
      <ConfirmDialog
        open={dialog?.kind === 'restore'}
        title={`Restore ${current?.first_name} ${current?.last_name}?`}
        message="They will be able to sign in again with their existing password."
        confirmLabel="Restore account"
        onClose={() => setDialog(null)}
        onConfirm={async () => { await api.post(`/users/${current.id}/restore`); notify('Account restored.'); reload(); }}
      />
      {notice}
    </>
  );
}
