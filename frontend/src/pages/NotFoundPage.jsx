import { Link as RouterLink } from 'react-router-dom';
import { Button } from '@mui/material';
import { EmptyState } from '../components/Feedback';

/** Unknown route. */
export default function NotFoundPage() {
  return (
    <EmptyState
      title="This page does not exist"
      hint="It may have moved, or the link is wrong."
      action={<Button component={RouterLink} to="/" variant="contained">Go to overview</Button>}
    />
  );
}
