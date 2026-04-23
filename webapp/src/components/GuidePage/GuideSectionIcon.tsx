import type { ReactNode } from 'react';

interface GuideSectionIconProps {
  icon: ReactNode;
}

export function GuideSectionIcon({ icon }: GuideSectionIconProps) {
  return (
    <span
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border"
      style={{
        borderColor: 'color-mix(in srgb, var(--color-accent) 30%, var(--border-primary) 70%)',
        backgroundColor: 'color-mix(in srgb, var(--color-accent) 8%, var(--bg-primary) 92%)',
        color: 'var(--color-accent)',
      }}
      aria-hidden="true"
    >
      {icon}
    </span>
  );
}
