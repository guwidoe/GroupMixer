import React, { useRef } from 'react';
import { useUseCaseConnectorLines } from './hooks/useUseCaseConnectorLines';

export function UseCasesSection() {
  const lineSvgRef = useRef<SVGSVGElement | null>(null);

  useUseCaseConnectorLines(lineSvgRef);

  return (
    <section className="py-16 px-4 sm:px-6 md:px-8 bg-secondary">
      <div className="relative flex items-center justify-center min-h-[900px]">
        <svg
          ref={lineSvgRef}
          className="absolute inset-0 w-full h-full pointer-events-none z-0"
          width="100%"
          height="100%"
          style={{ minWidth: '100%', minHeight: '100%' }}
        />

        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center justify-center border-[2.5px] border-white shadow-lg bg-transparent main-usecase-circle"
          style={{ width: 420, height: 420, borderRadius: '50%' }}
        >
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-primary mb-4 px-4">
            Handles Any Group Scheduling Scenario
          </h2>
          <p className="text-lg text-secondary text-center px-6">
            From small workshops to large conferences, GroupMixer works across all event sizes and formats.
          </p>
        </div>

        <div className="absolute usecase-circle" data-key="tl" style={{ left: '8%', top: '8%' }}>
          <div
            className="border-[2.5px] border-white shadow-md flex flex-col items-center justify-center bg-transparent"
            style={{ width: 303, height: 303, borderRadius: '50%' }}
          >
            <h3 className="text-xl font-semibold text-primary mb-2 text-center px-2">Conferences &amp; Workshops</h3>
            <ul className="space-y-2 text-secondary text-center text-base px-4">
              <li>– Rotating breakout sessions</li>
              <li>– Networking mixers</li>
              <li>– Skill-based workshop groupings</li>
              <li>– Panels with balanced representation</li>
            </ul>
          </div>
        </div>

        <div className="absolute usecase-circle" data-key="tr" style={{ right: '8%', top: '8%' }}>
          <div
            className="border-[2.5px] border-white shadow-md flex flex-col items-center justify-center bg-transparent"
            style={{ width: 303, height: 303, borderRadius: '50%' }}
          >
            <h3 className="text-xl font-semibold text-primary mb-2 text-center px-2">Team Building &amp; Training</h3>
            <ul className="space-y-2 text-secondary text-center text-base px-4">
              <li>– Cross-department collaboration</li>
              <li>– Skill-balanced training groups</li>
              <li>– Mentorship pairings</li>
              <li>– Project team assignments</li>
            </ul>
          </div>
        </div>

        <div className="absolute usecase-circle" data-key="br" style={{ right: '8%', bottom: '8%' }}>
          <div
            className="border-[2.5px] border-white shadow-md flex flex-col items-center justify-center bg-transparent"
            style={{ width: 303, height: 303, borderRadius: '50%' }}
          >
            <h3 className="text-xl font-semibold text-primary mb-2 text-center px-2">Education</h3>
            <ul className="space-y-2 text-secondary text-center text-base px-4">
              <li>– Student project rotations</li>
              <li>– Peer learning circles</li>
              <li>– Lab partners and study groups</li>
              <li>– Classroom discussion groups</li>
            </ul>
          </div>
        </div>

        <div className="absolute usecase-circle" data-key="bl" style={{ left: '8%', bottom: '8%' }}>
          <div
            className="border-[2.5px] border-white shadow-md flex flex-col items-center justify-center bg-transparent"
            style={{ width: 303, height: 303, borderRadius: '50%' }}
          >
            <h3 className="text-xl font-semibold text-primary mb-2 text-center px-2">Social &amp; Community Events</h3>
            <ul className="space-y-2 text-secondary text-center text-base px-4">
              <li>– Speed dating and social mixers</li>
              <li>– Game groups and tournament brackets</li>
              <li>– Volunteer team assignments</li>
              <li>– Interest-based meetup groups</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
