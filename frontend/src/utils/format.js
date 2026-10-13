/** Formatting helpers shared across pages. */

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** @returns {string} $12,500 or an em dash for null */
export const formatMoney = (v) => (v === null || v === undefined ? '—' : money.format(v));

/** @returns {string} Mar 2, 2026 */
export const formatDate = (v) => (v ? dateFmt.format(new Date(`${String(v).slice(0, 10)}T00:00:00`)) : '—');

/** @returns {string} 42% or an em dash */
export const formatPct = (v) => (v === null || v === undefined ? '—' : `${Math.round(v)}%`);

/** @returns {string} today as YYYY-MM-DD in local time */
export const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
  .toISOString().slice(0, 10);

/** Human label for a days-remaining figure. */
export const daysLabel = (days) => {
  if (days === 0) return 'Due today';
  if (days < 0) return `${Math.abs(days)} days late`;
  return `${days} days left`;
};

export const RISK = {
  on_track: { label: 'On track', color: 'success' },
  at_risk: { label: 'At risk', color: 'warning' },
  high_risk: { label: 'High risk', color: 'error' },
  closed: { label: 'Closed', color: 'default' },
};

export const DELIVERABLE_STATUS = {
  planned: { label: 'Planned', color: 'default' },
  in_progress: { label: 'In progress', color: 'primary' },
  completed: { label: 'Completed', color: 'success' },
};
