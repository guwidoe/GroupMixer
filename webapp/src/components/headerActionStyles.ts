import { getButtonClassName } from './ui';

export const HEADER_ACTION_GROUP_CLASS = 'flex flex-wrap items-center gap-2 w-full sm:w-auto';

export const HEADER_ACTION_BUTTON_CLASS = getButtonClassName({
  variant: 'secondary',
  size: 'lg',
});
