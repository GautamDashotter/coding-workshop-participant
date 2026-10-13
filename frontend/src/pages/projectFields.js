/** Project form definition, shared by create and edit. */
export const projectFields = (managers, { isAdmin }) => [
  { name: 'name', label: 'Project name', required: true },
  { name: 'description', label: 'Description and goal', type: 'textarea' },
  { name: 'department', label: 'Department' },
  { name: 'start_date', label: 'Start date', type: 'date', required: true },
  { name: 'end_date', label: 'End date', type: 'date', required: true },
  {
    name: 'allocated_hours', label: 'Allocated hours', type: 'number', required: true, min: 0,
  },
  {
    name: 'budget', label: 'Budget (USD)', type: 'number', min: 0, step: 100,
  },
  {
    name: 'manager_id',
    label: 'Project manager',
    type: 'select',
    required: true,
    options: managers,
    readOnly: !isAdmin,
    help: isAdmin ? '' : 'Only admins can change the manager.',
  },
];
