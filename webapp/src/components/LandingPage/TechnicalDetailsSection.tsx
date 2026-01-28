import React from 'react';
import { Lightbulb, Zap } from 'lucide-react';

export function TechnicalDetailsSection() {
  return (
    <section className="py-16 px-4 sm:px-6 md:px-8 bg-primary">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl sm:text-4xl font-bold text-center text-secondary mb-4">
          Built with Advanced Technology
        </h2>
        <p className="text-xl text-tertiary text-center mb-12 max-w-3xl mx-auto">
          GroupMixer leverages cutting-edge optimization algorithms and modern web technologies to deliver fast,
          reliable results for even the most complex scheduling challenges.
        </p>

        <div className="grid md:grid-cols-2 gap-12">
          <div className="card p-8">
            <div className="flex items-center mb-6">
              <Lightbulb className="w-8 h-8 text-accent mr-3" />
              <h3 className="text-2xl font-semibold text-primary">The Social Golfer Problem</h3>
            </div>
            <p className="text-secondary mb-4">
              GroupMixer solves a classic problem in combinatorial optimization known as the "Social Golfer Problem."
              This involves arranging people into groups across multiple sessions to maximize unique pairings.
            </p>
            <p className="text-secondary">
              Our implementation extends this concept with additional constraints like attribute balancing, fixed
              assignments, and partial participation - making it practical for real-world scenarios.
            </p>
          </div>

          <div className="card p-8">
            <div className="flex items-center mb-6">
              <Zap className="w-8 h-8 text-accent mr-3" />
              <h3 className="text-2xl font-semibold text-primary">Optimization Engine</h3>
            </div>
            <p className="text-secondary mb-4">
              Built with Rust for maximum performance and compiled to WebAssembly for browser compatibility. Uses
              simulated annealing with configurable parameters to find near-optimal solutions.
            </p>
            <p className="text-secondary">
              The solver evaluates millions of possible arrangements per second, balancing multiple objectives and
              constraints to deliver the best possible group assignments.
            </p>
          </div>
        </div>

        <div className="mt-12 card p-8 text-center">
          <h3 className="text-2xl font-semibold text-primary mb-4">Open Source &amp; Privacy-First</h3>
          <p className="text-secondary mb-6 max-w-3xl mx-auto">
            GroupMixer is completely open source and runs entirely in your browser. No data is sent to our servers -
            your participant information and group assignments remain completely private. The entire optimization
            process happens locally on your device.
          </p>
          <div className="flex flex-wrap justify-center gap-4 text-sm text-tertiary">
            <span className="bg-secondary px-3 py-1 rounded-full">Rust + WebAssembly</span>
            <span className="bg-secondary px-3 py-1 rounded-full">React + TypeScript</span>
            <span className="bg-secondary px-3 py-1 rounded-full">Local Processing</span>
            <span className="bg-secondary px-3 py-1 rounded-full">No Data Collection</span>
          </div>
        </div>
      </div>
    </section>
  );
}
