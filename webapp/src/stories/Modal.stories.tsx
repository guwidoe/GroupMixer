import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import ModalWrapper from '../components/ui/ModalWrapper';
import ModalHeader from '../components/ui/ModalHeader';
import ModalFooter from '../components/ui/ModalFooter';

/**
 * Modal components work together to create consistent modal dialogs.
 * - ModalWrapper provides the backdrop and container
 * - ModalHeader provides title, subtitle, and close button
 * - ModalFooter provides action buttons
 */
const meta: Meta<typeof ModalWrapper> = {
  title: 'UI/Modal',
  component: ModalWrapper,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ModalWrapper>;

export const SmallModal: Story = {
  args: {
    maxWidth: 'sm',
    children: (
      <>
        <ModalHeader title="Confirm Delete" onClose={fn()} />
        <p className="text-gray-600 dark:text-gray-300 mb-4">
          Are you sure you want to delete this item? This action cannot be undone.
        </p>
        <ModalFooter 
          onCancel={fn()} 
          onSave={fn()} 
          cancelLabel="Cancel" 
          saveLabel="Delete" 
          saveDanger 
        />
      </>
    ),
  },
};

export const MediumModal: Story = {
  args: {
    maxWidth: 'md',
    children: (
      <>
        <ModalHeader 
          title="Add Person" 
          subtitle="Enter the details of the person to add"
          onClose={fn()} 
        />
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Name
            </label>
            <input 
              type="text" 
              className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
              placeholder="Enter name..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email
            </label>
            <input 
              type="email" 
              className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
              placeholder="Enter email..."
            />
          </div>
        </div>
        <ModalFooter onCancel={fn()} onSave={fn()} saveLabel="Add Person" />
      </>
    ),
  },
};

export const LargeModal: Story = {
  args: {
    maxWidth: 'lg',
    children: (
      <>
        <ModalHeader 
          title="Group Settings" 
          subtitle="Configure advanced settings for this group"
          onClose={fn()} 
        />
        <div className="space-y-6">
          <section>
            <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">General</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.
            </p>
          </section>
          <section>
            <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Constraints</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo.
            </p>
          </section>
          <section>
            <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Advanced</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
            </p>
          </section>
        </div>
        <ModalFooter onCancel={fn()} onSave={fn()} />
      </>
    ),
  },
};

export const ExtraLargeModal: Story = {
  args: {
    maxWidth: '2xl',
    children: (
      <>
        <ModalHeader 
          title="Data Import" 
          subtitle="Import people and constraints from a file"
          onClose={fn()} 
        />
        <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-12 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            Drag and drop your file here, or click to browse
          </p>
          <button className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
            Browse Files
          </button>
        </div>
        <ModalFooter onCancel={fn()} onSave={fn()} saveLabel="Import" saveDisabled />
      </>
    ),
  },
};
