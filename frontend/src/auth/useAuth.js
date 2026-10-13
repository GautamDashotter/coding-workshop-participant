import { createContext, useContext } from 'react';

export const AuthContext = createContext(null);

/** @returns {object} auth state and helpers: user, login, logout, atLeast(role) */
export const useAuth = () => useContext(AuthContext);
