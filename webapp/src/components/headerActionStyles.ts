import { getButtonClassName } from './ui';

export const HEADER_ACTION_GROUP_CLASS = 'flex flex-wrap items-center gap-2 w-full sm:w-auto';
export const HEADER_ACTION_TOOLBAR_CLASS =
  'inline-flex w-full sm:w-auto items-center rounded-[1.15rem] border px-1.5 py-1';
export const HEADER_ACTION_DIVIDER_CLASS = 'hidden sm:block h-5 w-px shrink-0';

export const HEADER_ACTION_BUTTON_CLASS = getButtonClassName({
  variant: 'toolbar',
  size: 'md',
});

export const HEADER_ACTION_ICON_BUTTON_CLASS = [
  getButtonClassName({ variant: 'toolbar', size: 'icon' }),
  'h-10 w-10 min-h-10 min-w-10 rounded-xl p-0',
].join(' ');
