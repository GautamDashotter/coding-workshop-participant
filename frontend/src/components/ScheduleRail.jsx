import PropTypes from 'prop-types';
import { Box } from '@mui/material';
import { palette } from '../theme';

const FILL = { on_track: palette.onTrack, at_risk: palette.atRisk, high_risk: palette.highRisk, closed: palette.inkSoft };

/**
 * The schedule rail: work completed (fill) against time elapsed (the "today" mark).
 * When the fill falls behind the mark, the gap between them is the slip.
 */
export default function ScheduleRail({
  elapsedPct = 0, completionPct = 0, level = 'on_track', height = 8,
}) {
  const elapsed = Math.min(Math.max(elapsedPct ?? 0, 0), 100);
  const done = Math.min(Math.max(completionPct ?? 0, 0), 100);
  const behind = elapsed > done;
  return (
    <Box
      role="img"
      aria-label={`${Math.round(done)}% of deliverables complete, ${Math.round(elapsed)}% of time elapsed`}
      sx={{ position: 'relative', height, bgcolor: palette.rule, borderRadius: height / 2, my: 1 }}
    >
      {behind && (
        <Box sx={{
          position: 'absolute', left: `${done}%`, width: `${elapsed - done}%`, top: 0, bottom: 0,
          backgroundImage: `repeating-linear-gradient(135deg, ${FILL[level]}33 0 4px, transparent 4px 8px)`,
        }}
        />
      )}
      <Box sx={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: `${done}%`, bgcolor: FILL[level],
        borderRadius: height / 2,
      }}
      />
      <Box sx={{
        position: 'absolute', left: `calc(${elapsed}% - 1px)`, top: -4, bottom: -4, width: 2, bgcolor: palette.ink,
      }}
      />
    </Box>
  );
}
ScheduleRail.propTypes = {
  elapsedPct: PropTypes.number,
  completionPct: PropTypes.number,
  level: PropTypes.string,
  height: PropTypes.number,
};
