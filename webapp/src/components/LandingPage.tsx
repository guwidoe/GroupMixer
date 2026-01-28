import React from 'react';
import { LandingHero } from './LandingPage/LandingHero';
import { FeaturesSection } from './LandingPage/FeaturesSection';
import { UseCasesSection } from './LandingPage/UseCasesSection';
import { TechnicalDetailsSection } from './LandingPage/TechnicalDetailsSection';
import { CTASection } from './LandingPage/CTASection';
import { LandingFooter } from './LandingPage/LandingFooter';

const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-secondary">
      <LandingHero />
      <FeaturesSection />
      <UseCasesSection />
      <TechnicalDetailsSection />
      <CTASection />
      <LandingFooter />
    </div>
  );
};

export default LandingPage;
