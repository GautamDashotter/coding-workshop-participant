import PropTypes from 'prop-types';
import { Box, Typography } from '@mui/material';

/** Page title with an optional summary line and actions. */
export default function PageHeader({ title, summary = null, actions = null }) {
  return (
    <Box sx={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2, mb: 3,
    }}
    >
      <Box sx={{ maxWidth: 720 }}>
        <Typography variant="h1" component="h1">{title}</Typography>
        {summary && <Typography color="text.secondary" sx={{ mt: 0.5 }}>{summary}</Typography>}
      </Box>
      {actions && <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>{actions}</Box>}
    </Box>
  );
}
PageHeader.propTypes = { title: PropTypes.string.isRequired, summary: PropTypes.node, actions: PropTypes.node };
