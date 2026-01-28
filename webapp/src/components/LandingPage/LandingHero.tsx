import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowRight, Calendar, GitBranch, ListChecks } from 'lucide-react';
import GraphBackground from '../GraphBackground';
import { HeaderThemeToggle } from '../ThemeToggle';

export function LandingHero() {
  return (
    <header className="relative overflow-hidden landing-hero-bg">
      <GraphBackground />

      <div className="absolute top-4 right-4 z-20">
        <HeaderThemeToggle />
      </div>

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
                <p className="text-lg sm:text-xl md:text-2xl text-secondary landing-text">Make every meeting count.</p>
              </div>
            </div>

            <div className="mb-4 space-y-4 text-left max-w-2xl mx-auto">
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
                      GroupMixer generates group schedules for multi-session events. Designed for workshops,
                      conferences, and social mixers, it removes the need for manual planning and spreadsheet
                      juggling.
                    </p>
                  </div>
                </div>
              </div>

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
                      The algorithm prioritizes unique interactions by reducing repeated encounters across sessions,
                      helping participants meet as many new people as possible.
                    </p>
                  </div>
                </div>
              </div>

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
                      GroupMixer supports constraints such as grouping or separating specific participants, balancing
                      by attributes like gender or speciality, and handling partial attendance.
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
                  <p className="relative text-tertiary text-sm">Free to use • No signup required • Works in your browser</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

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
  );
}
