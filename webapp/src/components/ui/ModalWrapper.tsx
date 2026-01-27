/**
 * ModalWrapper - Provides the outer modal structure with backdrop and positioning.
 *
 * Usage:
 * <ModalWrapper maxWidth="md">
 *   <ModalHeader title="My Modal" onClose={handleClose} />
 *   <FormValidationError error={validationError} />
 *   <div>...content...</div>
 *   <ModalFooter onCancel={handleCancel} onSave={handleSave} />
 * </ModalWrapper>
 */

import React from 'react';

export type ModalWidth = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

interface ModalWrapperProps {
  children: React.ReactNode;
  maxWidth?: ModalWidth;
  className?: string;
}

const widthClasses: Record<ModalWidth, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
};

const ModalWrapper: React.FC<ModalWrapperProps> = ({
  children,
  maxWidth = 'lg',
  className = '',
}) => {
  return (
    <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
      <div
        className={`rounded-lg p-4 sm:p-6 w-full ${widthClasses[maxWidth]} mx-auto modal-content max-h-[90vh] overflow-y-auto ${className}`}
      >
        {children}
      </div>
    </div>
  );
};

export default ModalWrapper;
