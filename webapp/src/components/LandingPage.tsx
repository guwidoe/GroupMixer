import React, { useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock,
  CheckCircle,
  ArrowRight,
  Star,
  Lightbulb,
  Calendar,
  GitBranch,
  ListChecks,
  ArrowDown,
  Settings,
  Download,
  Zap,
} from 'lucide-react';
import GraphBackground from './GraphBackground';
import { HeaderThemeToggle } from './ThemeToggle';

const LandingPage: React.FC = () => {
  // Refs for dynamic connector lines
  const bigCircleRef = useRef<HTMLDivElement | null>(null);
  const lineSvgRef = useRef<SVGSVGElement | null>(null);

  // Draw connector lines from big circle to each feature icon circle
  useEffect(() => {
    const drawLines = () => {
      const svg = lineSvgRef.current;
      const circleDiv = bigCircleRef.current;
      if (!svg || !circleDiv) return;

      const iconEls = Array.from(document.querySelectorAll('.feature-icon')) as HTMLElement[];
      if (!iconEls.length) return;

      // Get bounding boxes
      const circleRect = circleDiv.getBoundingClientRect();
      const svgRect = svg.getBoundingClientRect();

      const cx = circleRect.left + circleRect.width / 2 - svgRect.left;
      const cy = circleRect.top + circleRect.height / 2 - svgRect.top;
      const r = circleRect.width / 2;

      const lines: string[] = [];

      iconEls.forEach((iconEl) => {
        const iconRect = iconEl.getBoundingClientRect();
        const ix = iconRect.left + iconRect.width / 2 - svgRect.left;
        const iy = iconRect.top + iconRect.height / 2 - svgRect.top;

        const dx = ix - cx;
        const dy = iy - cy;
        const len = Math.hypot(dx, dy) || 1;
        const sx = cx + (dx / len) * r; // start point on big circle edge
        const sy = cy + (dy / len) * r;

        const rs = iconRect.width / 2; // small circle radius
        const ex = ix - (dx / len) * rs; // end point on small circle edge
        const ey = iy - (dy / len) * rs;

        lines.push(`<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="var(--text-primary)" stroke-width="2.5" stroke-linecap="round" />`);
      });

      svg.innerHTML = lines.join('');
    };

    // Initial draw and on resize
    drawLines();
    window.addEventListener('resize', drawLines);
    return () => window.removeEventListener('resize', drawLines);
  }, []);

  useEffect(() => {
    const drawLines = () => {
      const svg = lineSvgRef.current;
      const mainCircle = document.querySelector('.main-usecase-circle');
      const usecaseCircles = Array.from(document.querySelectorAll('.usecase-circle'));
      if (!svg || !mainCircle || usecaseCircles.length !== 4) return;

      // Clear SVG
      svg.innerHTML = '';

      // Get bounding rects
      const svgRect = svg.getBoundingClientRect();
      const mainRect = mainCircle.getBoundingClientRect();
      const mainCx = mainRect.left + mainRect.width / 2 - svgRect.left;
      const mainCy = mainRect.top + mainRect.height / 2 - svgRect.top;
      const mainR = mainRect.width / 2;

      usecaseCircles.forEach((circle) => {
        const rect = circle.getBoundingClientRect();
        const cx = rect.left + rect.width / 2 - svgRect.left;
        const cy = rect.top + rect.height / 2 - svgRect.top;
        const r = rect.width / 2;
        // Vector from main to usecase
        const dx = cx - mainCx;
        const dy = cy - mainCy;
        const dist = Math.hypot(dx, dy);
        if (dist === 0) return;
        // Start at edge of main, end at edge of usecase
        const startX = mainCx + (dx / dist) * mainR;
        const startY = mainCy + (dy / dist) * mainR;
        const endX = cx - (dx / dist) * r;
        const endY = cy - (dy / dist) * r;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', startX.toString());
        line.setAttribute('y1', startY.toString());
        line.setAttribute('x2', endX.toString());
        line.setAttribute('y2', endY.toString());
        line.setAttribute('stroke', 'white');
        line.setAttribute('stroke-width', '2.5');
        line.setAttribute('stroke-linecap', 'round');
        svg.appendChild(line);
      });
    };
    drawLines();
    window.addEventListener('resize', drawLines);
    return () => window.removeEventListener('resize', drawLines);
  }, []);

  const featureLineSvgRef = useRef<SVGSVGElement | null>(null);
  const featureBigCircleRef = useRef<HTMLDivElement | null>(null);

  // Draw connector lines for Features section
  useEffect(() => {
    const drawLines = () => {
      const svg = featureLineSvgRef.current;
      const circleDiv = featureBigCircleRef.current;
      if (!svg || !circleDiv) return;

      const iconEls = Array.from(document.querySelectorAll('.feature-icon')) as HTMLElement[];
      if (!iconEls.length) return;

      // Get bounding boxes
      const circleRect = circleDiv.getBoundingClientRect();
      const svgRect = svg.getBoundingClientRect();

      const cx = circleRect.left + circleRect.width / 2 - svgRect.left;
      const cy = circleRect.top + circleRect.height / 2 - svgRect.top;
      const r = circleRect.width / 2;

      const lines: string[] = [];

      iconEls.forEach((iconEl) => {
        const iconRect = iconEl.getBoundingClientRect();
        const ix = iconRect.left + iconRect.width / 2 - svgRect.left;
        const iy = iconRect.top + iconRect.height / 2 - svgRect.top;

        const dx = ix - cx;
        const dy = iy - cy;
        const len = Math.hypot(dx, dy) || 1;
        const sx = cx + (dx / len) * r; // start point on big circle edge
        const sy = cy + (dy / len) * r;

        const rs = iconRect.width / 2; // small circle radius
        const ex = ix - (dx / len) * rs; // end point on small circle edge
        const ey = iy - (dy / len) * rs;

        lines.push(`<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="var(--text-primary)" stroke-width="2.5" stroke-linecap="round" />`);
      });

      svg.innerHTML = lines.join('');
    };

    drawLines();
    window.addEventListener('resize', drawLines);
    return () => window.removeEventListener('resize', drawLines);
  }, []);

  return (
    <div className="min-h-screen bg-secondary">
      {/* Header */}
      <header className="relative overflow-hidden landing-hero-bg">
        {/* Animated graph/network background */}
        <GraphBackground />

        <div className="absolute top-4 right-4 z-20">
          <HeaderThemeToggle />
        </div>

        {/* Hero Section */}
        <section className="relative z-10 flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 min-h-screen">
          <div className="relative inline-block text-center">
            <div className="relative p-6 sm:p-8 md:p-12 max-w-4xl w-full">
              <div className="relative inline-block text-center mb-3">
                <div
                  className="absolute landing-backdrop-soft"
                  style={{
                    top: '-5%',
                    left: '-5%',
                    right: '-5%',
                    bottom: '-5%',
                    backgroundColor: `rgba(var(--landing-backdrop-rgb), var(--landing-backdrop-opacity))`,
                  }}
                ></div>
                <div className="relative px-4 sm:px-6 py-3 sm:py-4 max-w-xl mx-auto">
                  <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-primary mb-2 landing-text">
                    GroupMixer
                  </h1>
                  <p className="text-lg sm:text-xl md:text-2xl text-secondary landing-text">
                    Make every meeting count.
                  </p>
                </div>
              </div>

              {/* Description Section */}
              <div className="mb-4 space-y-4 text-left max-w-2xl mx-auto">
                {/* Paragraph 1 */}
                <div className="relative">
                  <div
                    className="absolute landing-backdrop-soft"
                    style={{
                      top: '-5%',
                      left: '-5%',
                      right: '-5%',
                      bottom: '-5%',
                      backgroundColor: `rgba(var(--landing-backdrop-rgb), var(--landing-backdrop-opacity))`,
                    }}
                  ></div>
                  <div className="relative flex items-start gap-4 p-4 max-w-[40rem] mx-auto">
                    <Calendar className="w-8 h-8 text-accent flex-shrink-0" />
                    <div>
                      <h2 className="text-2xl sm:text-3xl font-semibold text-primary mb-2 landing-text">
                        Automate Group Scheduling
                      </h2>
                      <p className="text-secondary landing-text">
                        GroupMixer generates group schedules for multi-session
                        events. Designed for workshops, conferences, and social
                        mixers, it removes the need for manual planning and
                        spreadsheet juggling.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Paragraph 2 */}
                <div className="relative">
                  <div
                    className="absolute landing-backdrop-soft"
                    style={{
                      top: '-5%',
                      left: '-5%',
                      right: '-5%',
                      bottom: '-5%',
                      backgroundColor: `rgba(var(--landing-backdrop-rgb), var(--landing-backdrop-opacity))`,
                    }}
                  ></div>
                  <div className="relative flex items-start gap-4 p-4 max-w-[40rem] mx-auto">
                    <GitBranch className="w-8 h-8 text-accent flex-shrink-0" />
                    <div>
                      <h2 className="text-2xl sm:text-3xl font-semibold text-primary mb-2 landing-text">
                        Maximize Encounters, Minimize Repeats
                      </h2>
                      <p className="text-secondary landing-text">
                        The algorithm prioritizes unique interactions by
                        reducing repeated encounters across sessions, helping
                        participants meet as many new people as possible.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Paragraph 3 */}
                <div className="relative">
                  <div
                    className="absolute landing-backdrop-soft"
                    style={{
                      top: '-5%',
                      left: '-5%',
                      right: '-5%',
                      bottom: '-5%',
                      backgroundColor: `rgba(var(--landing-backdrop-rgb), var(--landing-backdrop-opacity))`,
                    }}
                  ></div>
                  <div className="relative flex items-start gap-4 p-4 max-w-[40rem] mx-auto">
                    <ListChecks className="w-8 h-8 text-accent flex-shrink-0" />
                    <div>
                      <h2 className="text-2xl sm:text-3xl font-semibold text-primary mb-2 landing-text">
                        Built for Real-World Constraints
                      </h2>
                      <p className="text-secondary landing-text">
                        GroupMixer supports constraints such as grouping or
                        separating specific participants, balancing by
                        attributes like gender or speciality, and handling
                        partial attendance.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-center mt-1 mb-3 sm:mb-3 mb-12">
                <Link to="/app">
                  <button className="btn-primary text-xl sm:text-2xl px-8 sm:px-12 py-3 sm:py-4 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 inline-flex items-center gap-2">
                    Get Started <ArrowRight className="w-6 h-6" />
                  </button>
                </Link>
                <div className="w-full flex justify-center mt-2">
                  <div className="relative inline-block">
                    <div
                      className="absolute landing-backdrop-soft"
                      style={{
                        top: '-10%',
                        left: '-10%',
                        right: '-10%',
                        bottom: '-10%',
                        backgroundColor: `rgba(var(--landing-backdrop-rgb), var(--landing-backdrop-opacity))`,
                      }}
                    ></div>
                    <p className="relative text-tertiary text-sm">
                      Free to use • No signup required • Works in your browser
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Scroll Down Indicator */}
        <a
          href="#features"
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center text-tertiary text-sm cursor-pointer hover:text-primary transition-colors animate-bounce"
          aria-label="Scroll to features"
        >
          <span className="relative inline-block">
            <span className="relative">Find out more</span>
            <span
              className="absolute landing-backdrop-soft"
              style={{
                top: '-10%',
                left: '-10%',
                right: '-10%',
                bottom: '-10%',
                backgroundColor: `rgba(var(--landing-backdrop-rgb), var(--landing-backdrop-opacity))`,
                zIndex: -1,
              }}
            ></span>
          </span>
          <ArrowDown className="w-5 h-5" />
        </a>
      </header>

      {/* Features Section */}
      <section
        id="features"
        className="relative py-16 sm:py-24 bg-secondary overflow-hidden"
      >
        <div className="relative max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-12 lg:gap-y-16 items-center px-4 sm:px-6 lg:px-8">
          {/* SVG overlay for connector lines - hidden on mobile */}
          <svg
            ref={lineSvgRef}
            className="absolute inset-0 w-full h-full pointer-events-none hidden lg:block"
          />

          {/* Left side: Circle and Title - hidden on mobile */}
          <div
            ref={bigCircleRef}
            className="absolute top-1/2 -translate-y-1/2 -left-[400px] xl:-left-[380px] h-[950px] w-[950px] pointer-events-none hidden lg:block"
          >
            <svg
              className="w-full h-full"
              viewBox="0 0 950 950"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                cx="475"
                cy="475"
                r="473"
                stroke="var(--text-primary)"
                strokeWidth="2.5"
              />
              {/* Radial lines from the big circle to each feature icon circle - these are now dynamically generated */}
            </svg>
          </div>

          {/* Text Content - centered on mobile, positioned on desktop */}
          <div className="relative text-center lg:text-left max-w-lg mx-auto lg:mx-0 lg:max-w-sm lg:ml-20 xl:ml-28">
            <h2 className="text-3xl sm:text-4xl font-bold text-primary mb-4">
              Powerful Features for Every Group Scenario
            </h2>
            <p className="text-lg sm:text-xl text-secondary">
              From simple team rotations to large multi-session events, Group
              Mixer supports a wide range of scheduling needs.
            </p>
          </div>

          {/* Right side: Feature Boxes */}
          <div className="space-y-8 sm:space-y-10 lg:space-y-12">
            <div className="flex items-start gap-4 sm:gap-6 max-w-xl mx-auto">
              <div
                className="feature-icon w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center flex-shrink-0 border-2"
                style={{ borderColor: 'var(--text-primary)' }}
              >
                <Settings
                  className="w-5 h-5 sm:w-7 sm:h-7"
                  style={{ color: 'var(--text-primary)' }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg sm:text-xl font-semibold text-primary">
                  Advanced Optimization
                </h3>
                <p className="text-secondary text-sm sm:text-base">
                  Leverages the Simulated Annealing algorithm to maximize unique
                  interactions across sessions while satisfying all defined
                  rules.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 sm:gap-6 max-w-xl mx-auto">
              <div
                className="feature-icon w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center flex-shrink-0 border-2"
                style={{ borderColor: 'var(--text-primary)' }}
              >
                <ListChecks
                  className="w-5 h-5 sm:w-7 sm:h-7"
                  style={{ color: 'var(--text-primary)' }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg sm:text-xl font-semibold text-primary">
                  Supports Custom Rules
                </h3>
                <p className="text-secondary text-sm sm:text-base">
                  Handles constraints such as keeping individuals together (or
                  apart), balancing group attributes, fixing assignments, and
                  managing partial attendance.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 sm:gap-6 max-w-xl mx-auto">
              <div
                className="feature-icon w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center flex-shrink-0 border-2"
                style={{ borderColor: 'var(--text-primary)' }}
              >
                <Clock
                  className="w-5 h-5 sm:w-7 sm:h-7"
                  style={{ color: 'var(--text-primary)' }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg sm:text-xl font-semibold text-primary">
                  Multi-Session Support
                </h3>
                <p className="text-secondary text-sm sm:text-base">
                  Ensures variety across time slots while respecting group size
                  limits and rules.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 sm:gap-6 max-w-xl mx-auto">
              <div
                className="feature-icon w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center flex-shrink-0 border-2"
                style={{ borderColor: 'var(--text-primary)' }}
              >
                <Zap
                  className="w-5 h-5 sm:w-7 sm:h-7"
                  style={{ color: 'var(--text-primary)' }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg sm:text-xl font-semibold text-primary">
                  Fast & Private
                </h3>
                <p className="text-secondary text-sm sm:text-base">
                  Processes hundreds of participants and complex constraints in
                  seconds. Runs locally in your browser - no installs required.
                  Your data stays private and secure.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 sm:gap-6 max-w-xl mx-auto">
              <div
                className="feature-icon w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center flex-shrink-0 border-2"
                style={{ borderColor: 'var(--text-primary)' }}
              >
                <Download
                  className="w-5 h-5 sm:w-7 sm:h-7"
                  style={{ color: 'var(--text-primary)' }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg sm:text-xl font-semibold text-primary">
                  Export & Share
                </h3>
                <p className="text-secondary text-sm sm:text-base">
                  Export schedules in CSV or JSON format. Save and reload setups
                  for future use.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="py-16 px-4 sm:px-6 md:px-8 bg-secondary">
        <div className="relative flex items-center justify-center min-h-[900px]">
          {/* SVG Connector Lines (dynamic) */}
          <svg
            ref={lineSvgRef}
            className="absolute inset-0 w-full h-full pointer-events-none z-0"
            width="100%"
            height="100%"
            style={{ minWidth: '100%', minHeight: '100%' }}
          />

          {/* Central Title Circle */}
          <div
            ref={bigCircleRef}
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

          {/* Use Case Circles - Diagonal Placement, Transparent Fill, White Border */}
          {/* Top-Left */}
          <div className="absolute usecase-circle" data-key="tl" style={{ left: '8%', top: '8%' }}>
            <div className="border-[2.5px] border-white shadow-md flex flex-col items-center justify-center bg-transparent" style={{ width: 303, height: 303, borderRadius: '50%' }}>
              <h3 className="text-xl font-semibold text-primary mb-2 text-center px-2">Conferences & Workshops</h3>
              <ul className="space-y-2 text-secondary text-center text-base px-4">
                <li>– Rotating breakout sessions</li>
                <li>– Networking mixers</li>
                <li>– Skill-based workshop groupings</li>
                <li>– Panels with balanced representation</li>
              </ul>
            </div>
          </div>
          {/* Top-Right */}
          <div className="absolute usecase-circle" data-key="tr" style={{ right: '8%', top: '8%' }}>
            <div className="border-[2.5px] border-white shadow-md flex flex-col items-center justify-center bg-transparent" style={{ width: 303, height: 303, borderRadius: '50%' }}>
              <h3 className="text-xl font-semibold text-primary mb-2 text-center px-2">Team Building & Training</h3>
              <ul className="space-y-2 text-secondary text-center text-base px-4">
                <li>– Cross-department collaboration</li>
                <li>– Skill-balanced training groups</li>
                <li>– Mentorship pairings</li>
                <li>– Project team assignments</li>
              </ul>
            </div>
          </div>
          {/* Bottom-Right */}
          <div className="absolute usecase-circle" data-key="br" style={{ right: '8%', bottom: '8%' }}>
            <div className="border-[2.5px] border-white shadow-md flex flex-col items-center justify-center bg-transparent" style={{ width: 303, height: 303, borderRadius: '50%' }}>
              <h3 className="text-xl font-semibold text-primary mb-2 text-center px-2">Education</h3>
              <ul className="space-y-2 text-secondary text-center text-base px-4">
                <li>– Student project rotations</li>
                <li>– Peer learning circles</li>
                <li>– Lab partners and study groups</li>
                <li>– Classroom discussion groups</li>
              </ul>
            </div>
          </div>
          {/* Bottom-Left */}
          <div className="absolute usecase-circle" data-key="bl" style={{ left: '8%', bottom: '8%' }}>
            <div className="border-[2.5px] border-white shadow-md flex flex-col items-center justify-center bg-transparent" style={{ width: 303, height: 303, borderRadius: '50%' }}>
              <h3 className="text-xl font-semibold text-primary mb-2 text-center px-2">Social & Community Events</h3>
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

      {/* Technical Details Section */}
      <section className="py-16 px-4 sm:px-6 md:px-8 bg-primary">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center text-secondary mb-4">
            Built with Advanced Technology
          </h2>
          <p className="text-xl text-tertiary text-center mb-12 max-w-3xl mx-auto">
            GroupMixer leverages cutting-edge optimization algorithms and
            modern web technologies to deliver fast, reliable results for
            even the most complex scheduling challenges.
          </p>

          <div className="grid md:grid-cols-2 gap-12">
            <div className="card p-8">
              <div className="flex items-center mb-6">
                <Lightbulb className="w-8 h-8 text-accent mr-3" />
                <h3 className="text-2xl font-semibold text-primary">
                  The Social Golfer Problem
                </h3>
              </div>
              <p className="text-secondary mb-4">
                GroupMixer solves a classic problem in combinatorial
                optimization known as the "Social Golfer Problem." This
                involves arranging people into groups across multiple
                sessions to maximize unique pairings.
              </p>
              <p className="text-secondary">
                Our implementation extends this concept with additional
                constraints like attribute balancing, fixed assignments, and
                partial participation - making it practical for real-world
                scenarios.
              </p>
            </div>

            <div className="card p-8">
              <div className="flex items-center mb-6">
                <Zap className="w-8 h-8 text-accent mr-3" />
                <h3 className="text-2xl font-semibold text-primary">
                  Optimization Engine
                </h3>
              </div>
              <p className="text-secondary mb-4">
                Built with Rust for maximum performance and compiled to
                WebAssembly for browser compatibility. Uses simulated
                annealing with configurable parameters to find near-optimal
                solutions.
              </p>
              <p className="text-secondary">
                The solver evaluates millions of possible arrangements per
                second, balancing multiple objectives and constraints to
                deliver the best possible group assignments.
              </p>
            </div>
          </div>

          <div className="mt-12 card p-8 text-center">
            <h3 className="text-2xl font-semibold text-primary mb-4">
              Open Source & Privacy-First
            </h3>
            <p className="text-secondary mb-6 max-w-3xl mx-auto">
              GroupMixer is completely open source and runs entirely in your
              browser. No data is sent to our servers - your participant
              information and group assignments remain completely private.
              The entire optimization process happens locally on your device.
            </p>
            <div className="flex flex-wrap justify-center gap-4 text-sm text-tertiary">
              <span className="bg-secondary px-3 py-1 rounded-full">
                Rust + WebAssembly
              </span>
              <span className="bg-secondary px-3 py-1 rounded-full">
                React + TypeScript
              </span>
              <span className="bg-secondary px-3 py-1 rounded-full">
                Local Processing
              </span>
              <span className="bg-secondary px-3 py-1 rounded-full">
                No Data Collection
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4 sm:px-6 md:px-8 bg-secondary">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-primary mb-4">
            Ready to Optimize Your Group Scheduling?
          </h2>
          <p className="text-xl text-secondary mb-8 max-w-2xl mx-auto">
            Join thousands of event organizers, educators, and team leaders
            who trust GroupMixer to create better group experiences.
          </p>

          <Link to="/app">
            <button className="btn-primary text-xl sm:text-2xl px-8 sm:px-12 py-3 sm:py-4 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 inline-flex items-center gap-2 mb-4">
              Start Optimizing Now <ArrowRight className="w-6 h-6" />
            </button>
          </Link>

          <div className="flex flex-wrap justify-center gap-6 text-sm text-tertiary mt-8">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-accent" />
              <span>Free forever</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-accent" />
              <span>No registration required</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-accent" />
              <span>Works offline</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-accent" />
              <span>Privacy-first</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 sm:px-6 md:px-8 bg-primary border-t border-tertiary">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-tertiary text-sm mb-2">
            Built to solve the Social Golfer Problem and similar
            combinatorial optimization challenges in event scheduling.
          </p>
          <p className="text-tertiary text-xs">
            © 2025 Guido Witt-Dörring
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage; 