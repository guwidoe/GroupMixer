import type { ToolPageKey, ToolPageLocalizedContent } from '../../pages/toolPageTypes';

const TRUST_BULLETS = [
  'Privé (traité dans votre navigateur)',
  'Sans inscription',
  'Résultats en quelques secondes',
];

const OPTIMIZER_FEATURES = [
  'Participation partielle',
  'Capacités par groupe et session',
  'Règles par session',
  'Contraintes souples pondérées',
  'Objectifs de rencontres par paire',
  'Réglage avancé des contraintes',
  'Réglages du solveur',
  'Analyse des résultats',
];

const OPTIMIZER_FEATURE_EXPLANATIONS = [
  'Définissez quels participants sont présents à quelles sessions au lieu de supposer que tout le monde participe à chaque tour.',
  'Donnez une capacité propre à chaque groupe et remplacez-la par session lorsque les salles ou l’encadrement changent.',
  'Appliquez les règles ensemble, séparés, assignation fixe, répétition et équilibrage uniquement aux sessions concernées.',
  'Ajoutez des préférences qui peuvent être violées si nécessaire, puis ajustez leur poids face aux autres objectifs.',
  'Ciblez le nombre de rencontres de certaines paires, avec des objectifs exacts, minimums ou maximums.',
  'Affinez les limites de répétition, les modes d’équilibrage par attribut, les pénalités et autres détails de contraintes.',
  'Ajustez les limites de temps, les graines déterministes, la famille de solveur et les autres réglages d’optimisation.',
  'Inspectez les scores, le respect des contraintes, les pénalités et les résultats enregistrés plus en détail.',
];

const CHROME = {
  expertWorkspaceLabel: 'Éditeur de scénarios',
  faqHeading: 'Questions fréquentes',
  footerTagline: 'GroupMixer — Générateur gratuit de groupes aléatoires',
  feedbackLabel: 'Commentaires',
  privacyNote: 'Tout le traitement se fait localement dans votre navigateur.',
  scrollHint: 'Faites défiler pour voir les cas d’usage et la FAQ',
};

const USE_CASES_SECTION = {
  title: 'Utile pour les classes, ateliers et événements',
  description:
    'Commencez par une répartition aléatoire simple. Quand vous avez besoin de plus de contrôle, GroupMixer évolue avec vous.',
  cards: [
    {
      title: 'Groupes de classe',
      body: 'Les enseignants collent une liste d’élèves et créent des groupes équilibrés en quelques secondes. Sans courbe d’apprentissage.',
    },
    {
      title: 'Salles d’atelier',
      body: 'Répartissez les participants en sous-groupes pour une séance unique ou plusieurs rotations.',
    },
    {
      title: 'Speed networking',
      body: 'Générez plusieurs tours pour que chacun rencontre de nouvelles personnes. Les répétitions sont minimisées automatiquement.',
    },
    {
      title: 'Projets d’équipe',
      body: 'Divisez une classe ou une équipe en groupes projet. Équilibrez si besoin par compétence, rôle ou service.',
    },
    {
      title: 'Sessions de conférence',
      body: 'Affectez les participants à des tables de discussion ou des parcours parallèles tout en respectant les contraintes.',
    },
    {
      title: 'Rencontres sociales',
      body: 'Préparez des tours brise-glace où chacun rencontre quelqu’un de nouveau. Gardez certaines personnes ensemble ou séparées.',
    },
  ],
};

const FAQS = {
  free: {
    question: 'GroupMixer est-il gratuit ?',
    answer:
      'Oui. GroupMixer est entièrement gratuit. Aucun compte, aucune inscription et aucune limite d’utilisation.',
  },
  privacy: {
    question: 'Mes données restent-elles privées ?',
    answer:
      'Oui. Tout le traitement se fait localement dans votre navigateur. Vos noms et vos données de groupes ne sont jamais envoyés à un serveur. Une fois la page chargée, vous pouvez aussi l’utiliser hors ligne.'
  },
  constraints: {
    question: 'Puis-je ajouter des règles comme garder ensemble ou séparer certaines personnes ?',
    answer:
      'Oui. Ouvrez les options avancées pour ajouter des groupes à garder ensemble, des règles d’évitement, plusieurs sessions et l’équilibrage par attribut. Ou utilisez l’éditeur de scénarios pour un contrôle complet.',
  },
  multiSession: {
    question: 'Puis-je créer des groupes pour plusieurs tours ?',
    answer:
      'Oui. Définissez le nombre de sessions dans les options avancées et activez "Éviter les répétitions" pour limiter le nombre de rencontres identiques.',
  },
  workspace: {
    question: 'Qu’est-ce que l’éditeur de scénarios ?',
    answer:
      'L’éditeur de scénarios sert aux contrôles que cette page n’expose pas : présence partielle, capacités par groupe et session, contraintes propres à chaque session, contraintes souples pondérées, objectifs de rencontres par paire, réglage avancé des contraintes, réglages du solveur, résultats précédents et analyse des résultats.',
  },
};

function createContent({
  title,
  description,
  eyebrow,
  heroTitle,
  subhead,
  audienceSummary,
  faqEntries,
}: {
  title: string;
  description: string;
  eyebrow: string;
  heroTitle: string;
  subhead: string;
  audienceSummary: string;
  faqEntries: ToolPageLocalizedContent['faqEntries'];
}): ToolPageLocalizedContent {
  return {
    seo: { title, description },
    hero: {
      eyebrow,
      title: heroTitle,
      subhead,
      audienceSummary,
      trustBullets: TRUST_BULLETS,
    },
    optimizerCta: {
      eyebrow: 'Besoin d’encore plus de contrôle ?',
      title: 'Ouvrez l’éditeur complet de scénario.',
      featureBullets: OPTIMIZER_FEATURES,
      featureExplanations: OPTIMIZER_FEATURE_EXPLANATIONS,
      buttonLabel: 'Ouvrir l’éditeur de scénarios',
      supportingText: 'Utilisez-le pour les options que cette page ne couvre pas. Vos participants, groupes, sessions et règles vous suivent.',
    },
    faqEntries,
    chrome: CHROME,
    useCasesSection: USE_CASES_SECTION,
  };
}

export const FR_TOOL_PAGE_CONTENT: Partial<Record<ToolPageKey, ToolPageLocalizedContent>> = {
  home: createContent({
    title: 'Générateur de Groupes Aléatoires — Répartissez des noms instantanément | GroupMixer',
    description:
      'Générateur gratuit de groupes aléatoires. Collez des noms, choisissez le nombre de groupes et créez des groupes équilibrés en quelques secondes. Sans inscription. Ajoutez des contraintes si nécessaire.',
    eyebrow: 'Pour les classes, ateliers et événements',
    heroTitle: 'Générateur de Groupes Aléatoires',
    subhead:
      'Collez des noms, choisissez le nombre de groupes et générez instantanément.',
    audienceSummary: '',
    faqEntries: [
      {
        question: 'Comment répartir une liste de noms en groupes aléatoires ?',
        answer:
          'Collez vos noms (un par ligne), définissez le nombre de groupes ou le nombre de personnes par groupe, puis cliquez sur « Générer les groupes ». Les groupes apparaissent immédiatement.',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.constraints,
      FAQS.multiSession,
      FAQS.workspace,
    ],
  }),
};
