export type GuidePageKey =
  | 'avoid-repeat-pairings-in-workshops'
  | 'run-speed-networking-rounds'
  | 'make-balanced-student-groups'
  | 'random-vs-balanced-vs-constrained-groups'
  | 'split-a-class-into-fair-groups'
  | 'make-random-pairs-from-a-list'
  | 'assign-breakout-rooms-for-online-workshops'
  | 'create-balanced-random-teams';

export interface GuidePageLink {
  label: string;
  description: string;
  href: string;
}

export interface GuidePageHero {
  eyebrow: string;
  title: string;
  intro: string;
}

export interface GuidePageProblemSection {
  title: string;
  body: string;
  bullets: string[];
}

export interface GuidePageCard {
  title: string;
  body: string;
}

export interface GuidePageExampleSection {
  title: string;
  summary: string;
  details: string[];
}

export interface GuidePageCtaSection {
  title: string;
  body: string;
  buttonLabel: string;
  href: string;
}

export interface GuidePageConfig {
  key: GuidePageKey;
  slug: string;
  canonicalPath: string;
  seo: {
    title: string;
    description: string;
  };
  hero: GuidePageHero;
  problem: GuidePageProblemSection;
  failureModes: {
    title: string;
    cards: GuidePageCard[];
  };
  example: GuidePageExampleSection;
  cta?: GuidePageCtaSection;
  relatedTools?: {
    title: string;
    links: GuidePageLink[];
  };
  relatedGuides?: {
    title: string;
    links: GuidePageLink[];
  };
}
