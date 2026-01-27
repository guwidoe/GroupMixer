/**
 * FormValidationError - Displays validation error messages in a styled box.
 */

import React from 'react';

interface FormValidationErrorProps {
  error: string | null | undefined;
  className?: string;
}

const FormValidationError: React.FC<FormValidationErrorProps> = ({ error, className = '' }) => {
  if (!error) return null;

  return (
    <div
      className={`mb-4 p-3 rounded-md border ${className}`}
      style={{
        backgroundColor: 'var(--color-error-50)',
        borderColor: 'var(--color-error-200)',
        color: 'var(--color-error-700)',
      }}
    >
      {error}
    </div>
  );
};

export default FormValidationError;
