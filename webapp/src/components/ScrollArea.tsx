import React, { forwardRef } from 'react';

type ScrollOrientation = 'vertical' | 'horizontal' | 'both';

interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: ScrollOrientation;
}

const ORIENTATION_CLASSES: Record<ScrollOrientation, string> = {
  vertical: 'overflow-y-auto overflow-x-hidden',
  horizontal: 'overflow-x-auto overflow-y-hidden',
  both: 'overflow-auto',
};

export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(function ScrollArea(
  { orientation = 'vertical', className = '', children, ...props },
  ref,
) {
  const classes = ['theme-scrollbar', ORIENTATION_CLASSES[orientation], className].filter(Boolean).join(' ');

  return (
    <div ref={ref} className={classes} {...props}>
      {children}
    </div>
  );
});
