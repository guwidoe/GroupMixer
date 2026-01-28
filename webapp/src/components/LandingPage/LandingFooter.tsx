import React from 'react';

export function LandingFooter() {
  return (
    <footer className="py-8 px-4 sm:px-6 md:px-8 bg-primary border-t border-tertiary">
      <div className="max-w-6xl mx-auto text-center">
        <p className="text-tertiary text-sm mb-2">
          Built to solve the Social Golfer Problem and similar combinatorial optimization challenges in event scheduling.
        </p>
        <p className="text-tertiary text-xs">© 2025 Guido Witt-Dörring</p>
      </div>
    </footer>
  );
}
