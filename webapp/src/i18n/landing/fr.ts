import type { ToolPageKey, ToolPageLocalizedContent } from '../../pages/toolPageTypes';

const TRUST_BULLETS = [
  'Privé (traité dans votre navigateur)',
  'Sans inscription',
  'Résultats en quelques secondes',
];

const OPTIMIZER_FEATURES = [
  'Garder ensemble',
  'Éviter certains binômes',
  'Plusieurs tours',
  'Maximiser le brassage',
  'Équilibrer les genres',
  'Équilibrer n’importe quel attribut',
  'Ajuster les résultats',
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

const ADVANCED_SECTION = {
  title: 'Besoin de plus de contrôle ?',
  description:
    'GroupMixer est plus qu’un simple mélangeur aléatoire. Quand des groupes simples ne suffisent plus, activez des règles avancées sans changer d’outil.',
  cards: [
    {
      title: 'Garder certaines personnes ensemble',
      body: 'Assurez-vous que des amis, collègues ou binômes prédéfinis restent dans le même groupe.',
    },
    {
      title: 'Garder certaines personnes séparées',
      body: 'Évitez que certaines personnes se retrouvent dans le même groupe, utile pour les conflits ou la diversité.',
    },
    {
      title: 'Éviter les répétitions',
      body: 'Lancez plusieurs tours sans que les mêmes personnes se retrouvent encore ensemble.',
    },
    {
      title: 'Équilibrer les groupes par attribut',
      body: 'Utilisez un CSV pour équilibrer selon le rôle, le niveau, le genre, le service ou toute autre colonne personnalisée.',
    },
  ],
  buttonLabel: 'Ouvrir l’éditeur de scénarios',
  supportingText:
    'L’éditeur de scénarios donne un contrôle complet sur les sessions, les contraintes, la configuration du solveur et l’analyse détaillée.',
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
      'L’éditeur de scénarios offre un contrôle détaillé sur les sessions, les contraintes, la configuration du solveur, la réutilisation de résultats précédents et l’analyse complète. Il utilise le même moteur puissant.',
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
      eyebrow: 'Vous voulez mieux qu’un tirage aléatoire ?',
      title: 'Utilisez l’optimiseur complet de groupes.',
      featureBullets: OPTIMIZER_FEATURES,
      buttonLabel: 'Ouvrir l’éditeur de scénarios',
      supportingText: 'Les informations saisies sur cette page vous suivent dans l’éditeur de scénarios.',
    },
    faqEntries,
    chrome: CHROME,
    useCasesSection: USE_CASES_SECTION,
    advancedSection: ADVANCED_SECTION,
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
  'random-group-generator': createContent({
    title: 'Générateur de Groupes Aléatoires — Créez des groupes à partir d’une liste de noms | GroupMixer',
    description:
      'Générateur gratuit de groupes aléatoires. Collez une liste de noms, choisissez le nombre de groupes et répartissez-les instantanément. Idéal pour les classes, ateliers et événements.',
    eyebrow: 'Pour des répartitions rapides et aléatoires',
    heroTitle: 'Générateur de Groupes Aléatoires',
    subhead:
      'Collez une liste de noms, choisissez le nombre de groupes voulu et répartissez-les instantanément. Sans inscription ni serveur : tout se passe dans votre navigateur.',
    audienceSummary:
      'Idéal quand vous avez besoin d’un outil rapide et simple pour des activités de classe, des sous-groupes d’atelier ou la logistique d’un événement.',
    faqEntries: [
      {
        question: 'Comment fonctionne le générateur de groupes aléatoires ?',
        answer:
          'Collez les noms dans la zone de texte (un par ligne), définissez le nombre de groupes ou la taille de chaque groupe, puis cliquez sur Générer. GroupMixer crée une répartition équilibrée immédiatement.',
      },
      {
        question: 'Puis-je choisir le nombre de groupes ou la taille des groupes ?',
        answer:
          'Oui. Vous pouvez fixer un nombre de groupes ou indiquer combien de personnes vous voulez par groupe. GroupMixer s’occupe du reste.',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.constraints,
    ],
  }),
  'random-team-generator': createContent({
    title: 'Générateur d’Équipes Aléatoires — Créez des équipes équilibrées rapidement | GroupMixer',
    description:
      'Générateur gratuit d’équipes aléatoires. Collez des noms et créez des équipes équilibrées instantanément. Ajoutez des règles pour équilibrer les compétences, garder ensemble ou séparer certaines personnes.',
    eyebrow: 'Pour les coachs, responsables et facilitateurs',
    heroTitle: 'Générateur d’Équipes Aléatoires',
    subhead:
      'Créez des équipes aléatoires en quelques secondes. Collez des noms, choisissez le nombre d’équipes et générez. Ajoutez des règles d’équilibrage quand c’est nécessaire.',
    audienceSummary:
      'Pensé pour les activités en équipe où l’équité compte davantage qu’un simple hasard, en particulier lorsqu’il faut répartir des rôles ou des compétences.',
    faqEntries: [
      {
        question: 'Comment créer des équipes aléatoires ?',
        answer:
          'Collez les noms des participants, définissez le nombre d’équipes puis cliquez sur Générer. GroupMixer répartit automatiquement les personnes dans des équipes équilibrées.',
      },
      {
        question: 'Puis-je équilibrer les équipes par compétence ou par rôle ?',
        answer:
          'Oui. Passez en mode CSV et ajoutez des colonnes comme « rôle » ou « compétence ». Utilisez ensuite l’équilibrage par attribut pour répartir ces valeurs de façon homogène.',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.multiSession,
    ],
  }),
  'breakout-room-generator': createContent({
    title: 'Générateur de Breakout Rooms — Répartissez les participants en salles | GroupMixer',
    description:
      'Générateur gratuit de breakout rooms. Collez des noms et répartissez les participants en salles instantanément. Idéal pour les classes, ateliers et réunions à distance.',
    eyebrow: 'Pour Zoom, les formations et les ateliers',
    heroTitle: 'Générateur de Breakout Rooms',
    subhead:
      'Répartissez les participants en salles de travail instantanément. Collez des noms, définissez le nombre de salles et générez. Parfait pour les ateliers, cours et sessions à distance.',
    audienceSummary:
      'Utile lorsque vous devez attribuer des salles rapidement, tout en gardant la possibilité de faire tourner les participants entre plusieurs tours.',
    faqEntries: [
      {
        question: 'Comment créer des breakout rooms ?',
        answer:
          'Collez les noms des participants, choisissez le nombre de salles puis cliquez sur Générer. GroupMixer répartit tout le monde immédiatement.',
      },
      {
        question: 'Puis-je faire tourner les participants sur plusieurs tours ?',
        answer:
          'Oui. Définissez plusieurs sessions dans les options avancées et activez « Éviter les répétitions » pour favoriser de nouvelles rencontres à chaque tour.',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.constraints,
    ],
  }),
  'workshop-group-generator': createContent({
    title: 'Générateur de Groupes pour Ateliers — Créez des petits groupes pour vos sessions | GroupMixer',
    description:
      'Générateur gratuit de groupes pour ateliers. Répartissez les participants en petits groupes pour des activités, sous-salles et sessions multi-tours. Ajoutez des contraintes si besoin.',
    eyebrow: 'Pour les facilitateurs de sessions collaboratives',
    heroTitle: 'Générateur de Groupes pour Ateliers',
    subhead:
      'Créez des groupes d’atelier en quelques secondes. Commencez simplement, puis ajoutez des tours, de l’équilibrage ou des règles selon la complexité de votre animation.',
    audienceSummary:
      'Conçu pour les ateliers où la composition des groupes influence la qualité des échanges, l’énergie et les nouvelles rencontres.',
    faqEntries: [
      {
        question: 'Comment créer des groupes pour un atelier ?',
        answer:
          'Collez les noms des participants, définissez le nombre de groupes ou le nombre de personnes par groupe, puis cliquez sur Générer. GroupMixer crée des groupes prêts à l’emploi immédiatement.',
      },
      {
        question: 'Puis-je faire tourner les participants entre les tours ?',
        answer:
          'Oui. Utilisez plusieurs sessions et l’option d’évitement des répétitions pour que les participants rencontrent de nouvelles personnes tout au long de l’atelier.',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.constraints,
    ],
  }),
  'student-group-generator': createContent({
    title: 'Générateur de Groupes d’Élèves — Créez des groupes de classe rapidement | GroupMixer',
    description:
      'Générateur gratuit de groupes d’élèves. Collez votre liste de classe et créez des groupes équilibrés en quelques secondes. Ajoutez des règles pour garder certains élèves ensemble ou séparés.',
    eyebrow: 'Pour les enseignants et les activités de classe',
    heroTitle: 'Générateur de Groupes d’Élèves',
    subhead:
      'Collez votre liste de classe et créez des groupes instantanément. Restez simple ou ajoutez des règles comme garder ensemble certains élèves ou équilibrer les équipes.',
    audienceSummary:
      'Conçu pour les enseignants qui doivent former des groupes rapidement sans perdre la main sur les binômes, les séparations ou l’équilibrage.',
    faqEntries: [
      {
        question: 'Comment créer des groupes d’élèves ?',
        answer:
          'Collez les noms des élèves (un par ligne), choisissez le nombre de groupes puis cliquez sur Générer. GroupMixer s’occupe du reste.',
      },
      {
        question: 'Puis-je garder certains élèves ensemble ou séparés ?',
        answer:
          'Oui. Ouvrez les options avancées pour définir des règles de regroupement ou d’évitement. Le solveur les respecte lors de la création des groupes.',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.multiSession,
    ],
  }),
  'speed-networking-generator': createContent({
    title: 'Générateur de Speed Networking — Plusieurs tours, moins de répétitions | GroupMixer',
    description:
      'Générateur gratuit de speed networking. Créez plusieurs tours où les participants rencontrent de nouvelles personnes à chaque fois. Les répétitions sont minimisées automatiquement.',
    eyebrow: 'Pour les mixers, meetups et sessions de networking',
    heroTitle: 'Générateur de Speed Networking',
    subhead:
      'Générez plusieurs tours de networking où chacun rencontre de nouveaux visages à chaque fois. Collez des noms, définissez les tours et réduisez les répétitions.',
    audienceSummary:
      'Parfait pour les formats de networking structurés où l’objectif est de créer de nouvelles connexions plutôt que de répéter les mêmes petits groupes.',
    faqEntries: [
      {
        question: 'Comment fonctionne le générateur de speed networking ?',
        answer:
          'Collez les noms des participants, définissez le nombre de tours (sessions) et activez « Éviter les répétitions ». GroupMixer crée des groupes pour chaque tour en limitant les rencontres répétées.',
      },
      {
        question: 'Puis-je contrôler la taille des groupes ?',
        answer:
          'Oui. Définissez soit le nombre de groupes par tour, soit le nombre de personnes par groupe. GroupMixer calcule le reste.',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.workspace,
    ],
  }),
};
