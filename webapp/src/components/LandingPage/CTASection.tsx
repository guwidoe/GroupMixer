import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle } from 'lucide-react';

export function CTASection() {
  return (
    <section className="py-16 px-4 sm:px-6 md:px-8 bg-secondary">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-3xl sm:text-4xl font-bold text-primary mb-4">
          Ready to Optimize Your Group Scheduling?
        </h2>
        <p className="text-xl text-secondary mb-8 max-w-2xl mx-auto">
          Join thousands of event organizers, educators, and team leaders who trust GroupMixer to create better group
          experiences.
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
  );
}
