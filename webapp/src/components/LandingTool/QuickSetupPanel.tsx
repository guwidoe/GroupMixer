import { Link } from 'react-router-dom';
import type { ToolPageConfig } from '../../pages/toolPageConfigs';
import { QuickSetupAdvancedOptions } from './QuickSetupAdvancedOptions';
import { QuickSetupBasicForm } from './QuickSetupBasicForm';
import { QuickSetupResults } from './QuickSetupResults';
import { useQuickSetup } from './useQuickSetup';

interface QuickSetupPanelProps {
  pageConfig: ToolPageConfig;
}

export function QuickSetupPanel({ pageConfig }: QuickSetupPanelProps) {
  const controller = useQuickSetup(pageConfig);

  return (
    <div className="space-y-5">
      <section
        className="rounded-[2rem] border p-6 shadow-sm"
        style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-secondary)' }}>
              Quick setup
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Create groups in under a minute</h2>
          </div>
          <Link
            to="/app"
            className="hidden rounded-full border px-4 py-2 text-sm font-medium lg:inline-flex"
            style={{ borderColor: 'var(--border-primary)' }}
          >
            Expert workspace
          </Link>
        </div>

        <p className="mt-4 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
          Keep this setup local while you experiment. The advanced app stays untouched until you explicitly choose to continue there.
        </p>

        <div className="mt-6 space-y-5">
          <QuickSetupBasicForm controller={controller} />
          <QuickSetupAdvancedOptions controller={controller} />
        </div>
      </section>

      <QuickSetupResults controller={controller} />
    </div>
  );
}
