import React, { useRef } from 'react';
import { Clock, Download, ListChecks, Settings, Zap } from 'lucide-react';
import { useFeatureConnectorLines } from './hooks/useFeatureConnectorLines';

export function FeaturesSection() {
  const lineSvgRef = useRef<SVGSVGElement | null>(null);
  const bigCircleRef = useRef<HTMLDivElement | null>(null);

  useFeatureConnectorLines(lineSvgRef, bigCircleRef);

  return (
    <section id="features" className="relative py-16 sm:py-24 bg-secondary overflow-hidden">
      <div className="relative max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-12 lg:gap-y-16 items-center px-4 sm:px-6 lg:px-8">
        <svg ref={lineSvgRef} className="absolute inset-0 w-full h-full pointer-events-none hidden lg:block" />

        <div
          ref={bigCircleRef}
          className="absolute top-1/2 -translate-y-1/2 -left-[400px] xl:-left-[380px] h-[950px] w-[950px] pointer-events-none hidden lg:block"
        >
          <svg className="w-full h-full" viewBox="0 0 950 950" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="475" cy="475" r="473" stroke="var(--text-primary)" strokeWidth="2.5" />
          </svg>
        </div>

        <div className="relative text-center lg:text-left max-w-lg mx-auto lg:mx-0 lg:max-w-sm lg:ml-20 xl:ml-28">
          <h2 className="text-3xl sm:text-4xl font-bold text-primary mb-4">
            Powerful Features for Every Group Scenario
          </h2>
          <p className="text-lg sm:text-xl text-secondary">
            From simple team rotations to large multi-session events, Group Mixer supports a wide range of scheduling
            needs.
          </p>
        </div>

        <div className="space-y-8 sm:space-y-10 lg:space-y-12">
          <div className="flex items-start gap-4 sm:gap-6 max-w-xl mx-auto">
            <div
              className="feature-icon w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center flex-shrink-0 border-2"
              style={{ borderColor: 'var(--text-primary)' }}
            >
              <Settings className="w-5 h-5 sm:w-7 sm:h-7" style={{ color: 'var(--text-primary)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg sm:text-xl font-semibold text-primary">Advanced Optimization</h3>
              <p className="text-secondary text-sm sm:text-base">
                Leverages the Simulated Annealing algorithm to maximize unique interactions across sessions while
                satisfying all defined rules.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 sm:gap-6 max-w-xl mx-auto">
            <div
              className="feature-icon w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center flex-shrink-0 border-2"
              style={{ borderColor: 'var(--text-primary)' }}
            >
              <ListChecks className="w-5 h-5 sm:w-7 sm:h-7" style={{ color: 'var(--text-primary)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg sm:text-xl font-semibold text-primary">Supports Custom Rules</h3>
              <p className="text-secondary text-sm sm:text-base">
                Handles constraints such as keeping individuals together (or apart), balancing group attributes, fixing
                assignments, and managing partial attendance.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 sm:gap-6 max-w-xl mx-auto">
            <div
              className="feature-icon w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center flex-shrink-0 border-2"
              style={{ borderColor: 'var(--text-primary)' }}
            >
              <Clock className="w-5 h-5 sm:w-7 sm:h-7" style={{ color: 'var(--text-primary)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg sm:text-xl font-semibold text-primary">Multi-Session Support</h3>
              <p className="text-secondary text-sm sm:text-base">
                Ensures variety across time slots while respecting group size limits and rules.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 sm:gap-6 max-w-xl mx-auto">
            <div
              className="feature-icon w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center flex-shrink-0 border-2"
              style={{ borderColor: 'var(--text-primary)' }}
            >
              <Zap className="w-5 h-5 sm:w-7 sm:h-7" style={{ color: 'var(--text-primary)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg sm:text-xl font-semibold text-primary">Fast &amp; Private</h3>
              <p className="text-secondary text-sm sm:text-base">
                Processes hundreds of participants and complex constraints in seconds. Runs locally in your browser - no
                installs required. Your data stays private and secure.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 sm:gap-6 max-w-xl mx-auto">
            <div
              className="feature-icon w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center flex-shrink-0 border-2"
              style={{ borderColor: 'var(--text-primary)' }}
            >
              <Download className="w-5 h-5 sm:w-7 sm:h-7" style={{ color: 'var(--text-primary)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg sm:text-xl font-semibold text-primary">Export &amp; Share</h3>
              <p className="text-secondary text-sm sm:text-base">
                Export schedules in CSV or JSON format. Save and reload setups for future use.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
