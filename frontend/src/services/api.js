/**
 * API client for the pm-service Lambda.
 * Locally VITE_API_URL is the CORS proxy (http://localhost:3001);
 * in the cloud it is the CloudFront domain.
 */
const BASE_URL = `${import.meta.env.VITE_API_URL ?? ''}/api/pm-service`;
const TOKEN_KEY = 'acme.token';

let onUnauthorized = () => {};

/** Error carrying the API's code, message and per-field details. */
export class ApiError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = details.fields || {};
  }
}

/** @returns {string|null} the stored session token */
export const getToken = () => localStorage.getItem(TOKEN_KEY);

/** Store or clear the session token. */
export const setToken = (token) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
};

/** Register what happens when the session becomes invalid. */
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

/**
 * Perform a request and return parsed JSON (or null for 204).
 * @param {string} method HTTP method
 * @param {string} path path after /api/pm-service
 * @param {object} [options] { body, query }
 */
export async function request(method, path, { body, query } = {}) {
  const params = query
    ? `?${new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== '' && v !== null))}`
    : '';
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['X-Auth-Token'] = token;
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}${params}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network_error', 'Cannot reach the server. Check your connection and try again.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data.error || {};
    if (res.status === 401 && path !== '/auth/login') onUnauthorized(err.message);
    throw new ApiError(res.status, err.code || 'error', err.message || `Request failed (${res.status}).`, err.details);
  }
  return data;
}

export const api = {
  get: (path, query) => request('GET', path, { query }),
  post: (path, body) => request('POST', path, { body }),
  put: (path, body) => request('PUT', path, { body }),
  del: (path) => request('DELETE', path),
};
