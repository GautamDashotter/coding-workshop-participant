import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ScheduleRail from '../components/ScheduleRail';
import RiskChip from '../components/RiskChip';
import FormDialog from '../components/FormDialog';

describe('ScheduleRail', () => {
  it('describes progress against time for screen readers', () => {
    render(<ScheduleRail elapsedPct={60} completionPct={25} level="at_risk" />);
    expect(screen.getByRole('img')).toHaveAccessibleName('25% of deliverables complete, 60% of time elapsed');
  });
});

describe('RiskChip', () => {
  it('shows the risk label', () => {
    render(<RiskChip level="high_risk" reasons={['Past its end date']} />);
    expect(screen.getByText('High risk')).toBeInTheDocument();
  });
});

describe('FormDialog', () => {
  const fields = [
    { name: 'name', label: 'Team name', required: true },
    {
      name: 'size', label: 'Size', type: 'number', min: 1,
    },
  ];

  it('blocks submission until required fields are filled', async () => {
    const onSubmit = vi.fn();
    render(<FormDialog open title="Create team" fields={fields} submitLabel="Create team" onSubmit={onSubmit} onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Create team' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('This field is required.')).toBeInTheDocument();
  });

  it('submits a clean payload and closes', async () => {
    const onSubmit = vi.fn().mockResolvedValue();
    const onClose = vi.fn();
    render(<FormDialog open title="Create team" fields={fields} submitLabel="Create team" onSubmit={onSubmit} onClose={onClose} />);
    await userEvent.type(screen.getByLabelText(/Team name/), 'Platform');
    await userEvent.type(screen.getByLabelText('Size'), '4');
    await userEvent.click(screen.getByRole('button', { name: 'Create team' }));
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Platform', size: 4 });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows server-side field errors next to the field', async () => {
    const err = Object.assign(new Error('Some fields need attention.'), { fields: { name: 'Already taken.' } });
    render(<FormDialog open title="Create team" fields={fields} submitLabel="Create team" onSubmit={vi.fn().mockRejectedValue(err)} onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText(/Team name/), 'Dup');
    await userEvent.click(screen.getByRole('button', { name: 'Create team' }));
    expect(await screen.findByText('Already taken.')).toBeInTheDocument();
    expect(screen.getByText('Some fields need attention.')).toBeInTheDocument();
  });
});
