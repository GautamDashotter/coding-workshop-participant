import { useState } from 'react';
import PropTypes from 'prop-types';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  AppBar, Avatar, Box, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Toolbar,
  Typography,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import SpaceDashboardOutlined from '@mui/icons-material/SpaceDashboardOutlined';
import FolderOutlined from '@mui/icons-material/FolderOutlined';
import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import PeopleAltOutlined from '@mui/icons-material/PeopleAltOutlined';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import BarChartOutlined from '@mui/icons-material/BarChartOutlined';
import LogoutOutlined from '@mui/icons-material/LogoutOutlined';
import { useMediaQuery } from 'react-responsive';
import { useAuth } from '../auth/useAuth';
import { palette } from '../theme';

const WIDTH = 236;
const NAV = [
  { to: '/', label: 'Overview', icon: <SpaceDashboardOutlined />, role: 'employee' },
  { to: '/projects', label: 'Projects', icon: <FolderOutlined />, role: 'employee' },
  { to: '/time', label: 'My time', icon: <ScheduleOutlined />, role: 'employee' },
  { to: '/resources', label: 'Workload', icon: <BarChartOutlined />, role: 'manager' },
  { to: '/teams', label: 'Teams', icon: <GroupsOutlined />, role: 'employee' },
  { to: '/users', label: 'People', icon: <PeopleAltOutlined />, role: 'admin' },
  { to: '/audit', label: 'Audit log', icon: <HistoryOutlined />, role: 'admin' },
];

function NavContent({ onNavigate = undefined }) {
  const { user, atLeast, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <Box sx={{
      height: '100%', display: 'flex', flexDirection: 'column', bgcolor: palette.ink, color: '#E8ECEF',
    }}
    >
      <Box sx={{ px: 2.5, py: 2.5 }}>
        <Typography sx={{ fontWeight: 700, fontStretch: '75%', fontSize: '1.35rem', lineHeight: 1 }}>ACME</Typography>
        <Typography sx={{ fontSize: '0.8rem', opacity: 0.7 }}>Delivery tracker</Typography>
      </Box>
      <List component="nav" aria-label="Main" sx={{ px: 1, flex: 1 }}>
        {NAV.filter((n) => atLeast(n.role)).map((n) => (
          <ListItemButton
            key={n.to}
            component={NavLink}
            to={n.to}
            end={n.to === '/'}
            onClick={onNavigate}
            sx={{
              borderRadius: 1,
              mb: 0.25,
              color: 'inherit',
              '&.active': { bgcolor: 'rgba(255,255,255,0.12)', boxShadow: `inset 3px 0 0 ${palette.onTrack}` },
              '&:focus-visible': { outline: '2px solid #fff' },
            }}
          >
            <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}>{n.icon}</ListItemIcon>
            <ListItemText primary={n.label} />
          </ListItemButton>
        ))}
      </List>
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.12)' }} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2 }}>
        <ListItemButton
          component={NavLink}
          to="/profile"
          onClick={onNavigate}
          sx={{
            borderRadius: 1, px: 1, color: 'inherit', gap: 1.5,
          }}
        >
          <Avatar src={user?.profile_picture_url || undefined} sx={{ width: 32, height: 32, bgcolor: palette.blueprint }}>
            {user?.first_name?.[0]}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: '0.9rem', fontWeight: 600 }}>{`${user?.first_name} ${user?.last_name}`}</Typography>
            <Typography noWrap sx={{ fontSize: '0.75rem', opacity: 0.7, textTransform: 'capitalize' }}>{user?.role}</Typography>
          </Box>
        </ListItemButton>
        <IconButton aria-label="Sign out" sx={{ color: 'inherit' }} onClick={() => { logout(); navigate('/login'); }}>
          <LogoutOutlined />
        </IconButton>
      </Box>
    </Box>
  );
}
NavContent.propTypes = { onNavigate: PropTypes.func };

/** App shell: permanent sidebar on desktop, drawer behind a menu button on small screens. */
export default function Layout() {
  const isDesktop = useMediaQuery({ minWidth: 900 });
  const [open, setOpen] = useState(false);
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {isDesktop ? (
        <Drawer variant="permanent" sx={{ width: WIDTH, '& .MuiDrawer-paper': { width: WIDTH, border: 0 } }}>
          <NavContent />
        </Drawer>
      ) : (
        <>
          <AppBar position="fixed" elevation={0} sx={{ bgcolor: palette.ink }}>
            <Toolbar>
              <IconButton edge="start" color="inherit" aria-label="Open menu" onClick={() => setOpen(true)}>
                <MenuIcon />
              </IconButton>
              <Typography sx={{ fontWeight: 700, fontStretch: '75%', ml: 1 }}>ACME Delivery tracker</Typography>
            </Toolbar>
          </AppBar>
          <Drawer open={open} onClose={() => setOpen(false)} sx={{ '& .MuiDrawer-paper': { width: WIDTH } }}>
            <NavContent onNavigate={() => setOpen(false)} />
          </Drawer>
        </>
      )}
      <Box
        component="main"
        sx={{
          flex: 1, minWidth: 0, px: { xs: 2, md: 4 }, py: { xs: 10, md: 4 }, maxWidth: 1280,
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}
