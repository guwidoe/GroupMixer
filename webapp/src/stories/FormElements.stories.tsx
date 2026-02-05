import type { Meta, StoryObj } from '@storybook/react-vite';

/**
 * Form elements showcase the input, select, and checkbox styles used in GroupMixer.
 */

function FormElementsDemo() {
  return (
    <div className="space-y-6 max-w-md">
      {/* Text Input */}
      <div>
        <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
          Text Input
        </label>
        <input
          type="text"
          className="input"
          placeholder="Enter text..."
        />
      </div>

      {/* Input with label and hint */}
      <div>
        <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
          Person Name *
        </label>
        <input
          type="text"
          className="input"
          placeholder="e.g., Alice Johnson"
          defaultValue="Alice Johnson"
        />
        <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
          Enter the person's full name
        </p>
      </div>

      {/* Number Input */}
      <div>
        <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
          Group Capacity
        </label>
        <input
          type="number"
          className="input w-32"
          min="1"
          max="20"
          defaultValue="4"
        />
      </div>

      {/* Select */}
      <div>
        <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
          Department
        </label>
        <select className="select">
          <option value="">Select department...</option>
          <option value="engineering">Engineering</option>
          <option value="marketing">Marketing</option>
          <option value="sales">Sales</option>
          <option value="hr">Human Resources</option>
        </select>
      </div>

      {/* Checkbox */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="template"
          className="w-4 h-4"
          style={{ accentColor: 'var(--color-accent)' }}
        />
        <label htmlFor="template" className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Save as template
        </label>
      </div>

      {/* Multiple checkboxes */}
      <div>
        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
          Session Participation
        </label>
        <div className="flex flex-wrap gap-4">
          {[1, 2, 3, 4, 5].map(session => (
            <label key={session} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <input
                type="checkbox"
                className="w-4 h-4"
                style={{ accentColor: 'var(--color-accent)' }}
              />
              Session {session}
            </label>
          ))}
        </div>
      </div>

      {/* Disabled input */}
      <div>
        <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
          Person ID (read-only)
        </label>
        <input
          type="text"
          className="input"
          defaultValue="person-12345"
          disabled
        />
        <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
          IDs cannot be changed after creation
        </p>
      </div>
    </div>
  );
}

const meta: Meta<typeof FormElementsDemo> = {
  title: 'UI/FormElements',
  component: FormElementsDemo,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof FormElementsDemo>;

export const AllElements: Story = {};

export const TextInput: Story = {
  render: () => (
    <div className="max-w-md">
      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
        Name
      </label>
      <input type="text" className="input" placeholder="Enter name..." />
    </div>
  ),
};

export const NumberInput: Story = {
  render: () => (
    <div className="max-w-md">
      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
        Capacity
      </label>
      <input type="number" className="input w-32" min="1" max="20" defaultValue="4" />
    </div>
  ),
};

export const SelectInput: Story = {
  render: () => (
    <div className="max-w-md">
      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
        Gender
      </label>
      <select className="select">
        <option value="">Select gender...</option>
        <option value="male">Male</option>
        <option value="female">Female</option>
        <option value="non-binary">Non-binary</option>
      </select>
    </div>
  ),
};

export const CheckboxInput: Story = {
  render: () => (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
        <input type="checkbox" className="w-4 h-4" style={{ accentColor: 'var(--color-accent)' }} />
        Option 1
      </label>
      <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
        <input type="checkbox" className="w-4 h-4" style={{ accentColor: 'var(--color-accent)' }} defaultChecked />
        Option 2 (checked)
      </label>
      <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
        <input type="checkbox" className="w-4 h-4" style={{ accentColor: 'var(--color-accent)' }} />
        Option 3
      </label>
    </div>
  ),
};

export const SearchInput: Story = {
  render: () => (
    <div className="max-w-md">
      <input
        type="text"
        className="input w-full text-base py-3"
        placeholder="Search people..."
      />
    </div>
  ),
};

export const InputWithError: Story = {
  render: () => (
    <div className="max-w-md">
      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
        Group ID *
      </label>
      <input
        type="text"
        className="input border-red-500 focus:border-red-500"
        defaultValue=""
      />
      <p className="text-xs mt-1" style={{ color: 'var(--color-error-600)' }}>
        Group ID is required
      </p>
    </div>
  ),
};
