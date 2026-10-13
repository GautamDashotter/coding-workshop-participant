import PropTypes from 'prop-types';
import { Chip, Tooltip } from '@mui/material';
import { RISK } from '../utils/format';

/** Health badge; hovering lists the reasons behind the rating. */
export default function RiskChip({ level, reasons = [] }) {
  const meta = RISK[level] || RISK.closed;
  const chip = <Chip size="small" label={meta.label} color={meta.color} variant={level === 'on_track' ? 'outlined' : 'filled'} />;
  if (!reasons?.length) return chip;
  return <Tooltip title={reasons.join(' · ')}>{chip}</Tooltip>;
}
RiskChip.propTypes = { level: PropTypes.string.isRequired, reasons: PropTypes.arrayOf(PropTypes.string) };
