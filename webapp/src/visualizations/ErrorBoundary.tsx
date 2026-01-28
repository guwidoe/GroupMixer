import React from "react";

export class ErrorBoundary extends React.Component<
  {
    label: string;
    children: React.ReactNode;
  },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    // keep console signal for debugging
    console.error(`[Visualization] ${this.props.label} crashed:`, error);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        className="rounded border p-4"
        style={{
          backgroundColor: "var(--bg-primary)",
          borderColor: "var(--border-primary)",
          color: "var(--text-primary)",
        }}
      >
        <div className="text-sm font-medium">Visualization error</div>
        <div className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          {this.props.label}
        </div>
        <pre
          className="mt-3 text-xs whitespace-pre-wrap"
          style={{ color: "var(--text-secondary)" }}
        >
          {String(this.state.error?.stack || this.state.error?.message)}
        </pre>
      </div>
    );
  }
}
