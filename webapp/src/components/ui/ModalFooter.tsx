/**
 * ModalFooter - Footer with Cancel and Save/Submit buttons for modals.
 */

import React from 'react';

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
  const saveButtonClass = saveDanger
    ? 'btn-danger flex-1 sm:flex-none px-6 py-3 text-base font-medium'
    : 'btn-primary flex-1 sm:flex-none px-6 py-3 text-base font-medium';

  return (
    <div
      className="flex flex-col sm:flex-row justify-end gap-3 mt-8 pt-4 border-t"
      style={{ borderColor: 'var(--border-primary)' }}
    >
      <button
        onClick={onCancel}
        className="btn-secondary flex-1 sm:flex-none px-6 py-3 text-base font-medium"
      >
        {cancelLabel}
      </button>
      <button
        onClick={onSave}
        disabled={saveDisabled}
        className={saveButtonClass}
      >
        {saveLabel}
      </button>
    </div>
  );
};

export default ModalFooter;
