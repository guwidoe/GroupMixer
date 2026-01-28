import React from 'react';
import { AlertTriangle } from 'lucide-react';

export function ManualEditorNotReady() {
  return (
    <div className="rounded-lg border p-6" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
      <div className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
        <AlertTriangle className="w-5 h-5" />
        <span>Select a result first. The Manual Editor activates when a solution is available.</span>
      </div>
    </div>
  );
}
