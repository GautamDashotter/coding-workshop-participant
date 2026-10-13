import { useEffect, useState } from 'react';
import { api } from '../services/api';

/**
 * Load select options (managers, teams, project people) for forms.
 * @param {string|null} kind managers | teams | myTeams | projectPeople
 * @param {string} [projectId] needed for projectPeople
 */
export default function useOptions(kind, projectId) {
  const [options, setOptions] = useState([]);
  useEffect(() => {
    if (!kind) return;
    const load = {
      managers: async () => {
        const [m, a] = await Promise.all([api.get('/users', { role: 'manager' }), api.get('/users', { role: 'admin' })]);
        return [...m.items, ...a.items].map((u) => ({ value: u.id, label: `${u.first_name} ${u.last_name}` }));
      },
      teams: async () => (await api.get('/teams')).items.map((t) => ({ value: t.id, label: t.name })),
      myTeams: async () => (await api.get('/teams', { mine: 'true' })).items.map((t) => ({ value: t.id, label: t.name })),
      projectPeople: async () => (await api.get(`/projects/${projectId}/people`)).items
        .map((u) => ({ value: u.id, label: `${u.first_name} ${u.last_name}` })),
    }[kind];
    load().then(setOptions).catch(() => setOptions([]));
  }, [kind, projectId]);
  return options;
}
