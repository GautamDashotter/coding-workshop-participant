import PropTypes from 'prop-types';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/useAuth';
import Layout from './components/Layout';
import { Loading } from './components/Feedback';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import TimePage from './pages/TimePage';
import ResourcesPage from './pages/ResourcesPage';
import TeamsPage from './pages/TeamsPage';
import UsersPage from './pages/UsersPage';
import AuditPage from './pages/AuditPage';
import ProfilePage from './pages/ProfilePage';
import NotFoundPage from './pages/NotFoundPage';

/** Redirects to sign-in when there is no session; hides pages above the user's role. */
function Protected({ children, role = 'employee' }) {
  const { user, loading, atLeast } = useAuth();
  const location = useLocation();
  if (loading) return <Loading label="Restoring your session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!atLeast(role)) return <Navigate to="/" replace />;
  return children;
}
Protected.propTypes = { children: PropTypes.node.isRequired, role: PropTypes.string };

/** Route table. */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route index element={<DashboardPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:id" element={<ProjectDetailPage />} />
        <Route path="time" element={<TimePage />} />
        <Route path="teams" element={<TeamsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="resources" element={<Protected role="manager"><ResourcesPage /></Protected>} />
        <Route path="users" element={<Protected role="admin"><UsersPage /></Protected>} />
        <Route path="audit" element={<Protected role="admin"><AuditPage /></Protected>} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
