import {
  useCallback, useEffect, useMemo, useState,
} from 'react';
import PropTypes from 'prop-types';
import { api, getToken, setToken, setUnauthorizedHandler } from '../services/api';
import { AuthContext } from './useAuth';

const RANK = { employee: 1, manager: 2, admin: 3 };
const REFRESH_BEFORE_MS = 30 * 60 * 1000;

/** Provides the signed-in user, login/logout and role helpers. */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const [notice, setNotice] = useState('');

  const logout = useCallback((message = '') => {
    setToken(null);
    localStorage.removeItem('acme.expires');
    setUser(null);
    setNotice(message);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler((message) => logout(message || 'Your session ended. Sign in again.'));
    if (!getToken()) return;
    api.get('/auth/me').then(setUser).catch(() => logout()).finally(() => setLoading(false));
  }, [logout]);

  // Refresh the token shortly before it expires while the app is open.
  useEffect(() => {
    if (!user) return undefined;
    const timer = setInterval(async () => {
      const expires = Date.parse(localStorage.getItem('acme.expires') || '');
      if (expires && expires - Date.now() < REFRESH_BEFORE_MS) {
        const fresh = await api.post('/auth/refresh').catch(() => null);
        if (fresh) {
          setToken(fresh.token);
          localStorage.setItem('acme.expires', fresh.expires_at);
        }
      }
    }, 60 * 1000);
    return () => clearInterval(timer);
  }, [user]);

  const login = useCallback(async (loginId, password) => {
    const data = await api.post('/auth/login', { login: loginId, password });
    setToken(data.token);
    localStorage.setItem('acme.expires', data.expires_at);
    setNotice('');
    setUser(data.user);
    return data.user;
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    notice,
    login,
    logout,
    setUser,
    atLeast: (role) => Boolean(user) && RANK[user.role] >= RANK[role],
  }), [user, loading, notice, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

AuthProvider.propTypes = { children: PropTypes.node.isRequired };

