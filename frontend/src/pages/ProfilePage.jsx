import { useState } from 'react';
import {
  Box, Button, Paper, Typography,
} from '@mui/material';
import useNotice from '../hooks/useNotice';
import { useAuth } from '../auth/useAuth';
import { api } from '../services/api';
import PageHeader from '../components/PageHeader';
import FormDialog from '../components/FormDialog';

/** Personal details the user can change themselves. */
export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const [dialog, setDialog] = useState(null);
  const [notice, notify] = useNotice();
  const rows = [
    ['Name', `${user.first_name} ${user.last_name}`],
    ['Email', user.email],
    ['Username', user.username],
    ['Role', user.role],
    ['Job title', user.job_title || '—'],
  ];
  return (
    <>
      <PageHeader title="Your profile" summary="Role, team and job title are managed by an admin." />
      <Paper variant="outlined" sx={{ p: 2.5, maxWidth: 560 }}>
        <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: '140px 1fr', rowGap: 1.5, m: 0 }}>
          {rows.map(([k, v]) => [
            <Typography key={`${k}-k`} component="dt" color="text.secondary">{k}</Typography>,
            <Typography key={`${k}-v`} component="dd" sx={{ m: 0, textTransform: k === 'Role' ? 'capitalize' : 'none' }}>{v}</Typography>,
          ])}
        </Box>
        <Box sx={{ display: 'flex', gap: 1, mt: 3, flexWrap: 'wrap' }}>
          <Button variant="contained" onClick={() => setDialog('edit')}>Edit details</Button>
          <Button variant="outlined" onClick={() => setDialog('password')}>Change password</Button>
        </Box>
      </Paper>
      <FormDialog
        open={dialog === 'edit'}
        title="Edit your details"
        submitLabel="Save changes"
        fields={[
          { name: 'first_name', label: 'First name', required: true },
          { name: 'last_name', label: 'Last name', required: true },
          {
            name: 'email', label: 'Email', type: 'email', required: true,
          },
          { name: 'profile_picture_url', label: 'Profile picture URL' },
        ]}
        initial={user}
        onClose={() => setDialog(null)}
        onSubmit={async (values) => { setUser(await api.put('/auth/me', values)); notify('Details saved.'); }}
      />
      <FormDialog
        open={dialog === 'password'}
        title="Change password"
        submitLabel="Change password"
        fields={[
          {
            name: 'current_password', label: 'Current password', type: 'password', required: true,
          },
          {
            name: 'new_password', label: 'New password', type: 'password', required: true, minLength: 8,
          },
        ]}
        onClose={() => setDialog(null)}
        onSubmit={async (values) => { await api.post('/auth/password', values); notify('Password changed.'); }}
      />
      {notice}
    </>
  );
}
