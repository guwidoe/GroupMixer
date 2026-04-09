/**
 * ModalFooter - Footer with Cancel and Save/Submit buttons for modals.
 */

import React from 'react';
import { Button } from './Button';

interface ModalFooterProps {
  onCancel: () => void;
  onSave: () => void;
  cancelLabel?: string;
  saveLabel?: string;
  saveDisabled?: boolean;
  saveDanger?: boolean;
}

const ModalFooter: React.FC<ModalFooterProps> = ({
  onCancel,
  onSave,
  cancelLabel = 'Cancel',
  saveLabel = 'Save',
  saveDisabled = false,
  saveDanger = false,
}) => {
  return (
    <div
      className="flex flex-col sm:flex-row justify-end gap-3 mt-8 pt-4 border-t"
      style={{ borderColor: 'var(--border-primary)' }}
    >
      <Button
        onClick={onCancel}
        variant="secondary"
        size="lg"
        className="flex-1 sm:flex-none"
      >
        {cancelLabel}
      </Button>
      <Button
        onClick={onSave}
        disabled={saveDisabled}
        variant={saveDanger ? 'danger' : 'primary'}
        size="lg"
        className="flex-1 sm:flex-none"
      >
        {saveLabel}
      </Button>
    </div>
  );
};

export default ModalFooter;
