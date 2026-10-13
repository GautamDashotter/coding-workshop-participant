import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import {
  api, ApiError, setToken, setUnauthorizedHandler,
} from '../services/api';

const respond = (status, body) => vi.fn().mockResolvedValue({
  status, ok: status < 400, json: () => Promise.resolve(body),
});

afterEach(() => { vi.restoreAllMocks(); setToken(null); });

describe('api client', () => {
  it('sends the session token and query string', async () => {
    globalThis.fetch = respond(200, { items: [] });
    setToken('abc');
    await api.get('/projects', { search: 'lake', status: '' });
    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toMatch(/\/api\/pm-service\/projects\?search=lake$/);
    expect(options.headers['X-Auth-Token']).toBe('abc');
  });

  it('turns error envelopes into ApiError with field details', async () => {
    globalThis.fetch = respond(400, { error: { code: 'validation_error', message: 'Bad', details: { fields: { name: 'Required' } } } });
    await expect(api.post('/teams', {})).rejects.toMatchObject({ status: 400, fields: { name: 'Required' } });
  });

  it('signals expired sessions', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    globalThis.fetch = respond(401, { error: { code: 'token_expired', message: 'Expired' } });
    await expect(api.get('/projects')).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledWith('Expired');
  });

  it('reports network failures plainly', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api.get('/projects')).rejects.toMatchObject({ code: 'network_error' });
  });
});
