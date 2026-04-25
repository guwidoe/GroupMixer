import type { ToolPageKey, ToolPageLocalizedContent } from '../../pages/toolPageTypes';

const TRUST_BULLETS = [
  'Privat (alles bleibt im Browser)',
  'Keine Anmeldung',
  'Ergebnisse in Sekunden',
];

const OPTIMIZER_FEATURES = [
  'Teilweise Anwesenheit',
  'Kapazitäten nach Gruppe und Session',
  'Session-spezifische Regeln',
  'Gewichtete weiche Constraints',
  'Zielwerte für Paar-Begegnungen',
  'Erweiterte Constraint-Feinsteuerung',
  'Solver-Einstellungen',
  'Ergebnisanalyse',
];

const OPTIMIZER_FEATURE_EXPLANATIONS = [
  'Lege fest, welche Personen in welchen Sessions teilnehmen, statt alle in jeder Runde einzuplanen.',
  'Gib jeder Gruppe eine eigene Kapazität und überschreibe sie pro Session, wenn Raumgrößen oder Betreuung wechseln.',
  'Wende Zusammenhalten-, Trennen-, Pinning-, Wiederholungs- und Balance-Regeln nur auf relevante Sessions an.',
  'Füge Präferenzen hinzu, die bei Bedarf verletzt werden dürfen, und gewichte sie gegenüber anderen Zielen.',
  'Steuere, wie oft bestimmte Paare sich im Plan begegnen sollen, inklusive exakter, minimaler oder maximaler Zielwerte.',
  'Feinsteuere Wiederholungslimits, Attribut-Balance-Modi, Penalties und weitere Constraint-Details.',
  'Passe Laufzeitlimits, deterministische Seeds, Solver-Familie und weitere Optimierungseinstellungen an.',
  'Prüfe Score-Aufschlüsselungen, Constraint-Erfüllung, Penalties und gespeicherte Ergebnisse genauer.',
];

const CHROME = {
  expertWorkspaceLabel: 'Szenario-Editor',
  faqHeading: 'Häufige Fragen',
  footerTagline: 'GroupMixer — Kostenloser Zufalls-Gruppengenerator',
  feedbackLabel: 'Feedback',
  privacyNote: 'Die gesamte Verarbeitung erfolgt lokal in deinem Browser.',
  scrollHint: 'Nach unten scrollen für Einsatzfälle und FAQ',
};

const USE_CASES_SECTION = {
  title: 'Geeignet für Unterricht, Workshops und Events',
  description:
    'Starte mit einer einfachen Zufallsaufteilung. Wenn du mehr Kontrolle brauchst, wächst GroupMixer einfach mit.',
  cards: [
    {
      title: 'Unterrichtsgruppen',
      body: 'Lehrkräfte fügen eine Klassenliste ein und erstellen in Sekunden ausgewogene Gruppen.',
    },
    {
      title: 'Workshop-Breakout-Gruppen',
      body: 'Teile Teilnehmende für eine einzelne Session oder für mehrere Runden auf.',
    },
    {
      title: 'Speed Networking',
      body: 'Erzeuge mehrere Runden, damit Menschen möglichst oft neue Kontakte treffen.',
    },
    {
      title: 'Projektteams',
      body: 'Teile eine Klasse oder ein Team in Projektgruppen auf und balanciere sie bei Bedarf nach Rolle oder Fähigkeit.',
    },
    {
      title: 'Konferenz-Sessions',
      body: 'Ordne Teilnehmende Tischen oder parallelen Tracks zu und beachte dabei vorhandene Regeln.',
    },
    {
      title: 'Social Mixer',
      body: 'Plane Kennenlern-Runden, in denen alle neue Personen treffen. Halte bestimmte Menschen zusammen oder getrennt.',
    },
  ],
};

const FAQS = {
  free: {
    question: 'Ist GroupMixer kostenlos?',
    answer:
      'Ja. GroupMixer ist komplett kostenlos. Es gibt keine Anmeldung, kein Konto und keine Nutzungsgrenzen.',
  },
  privacy: {
    question: 'Bleiben meine Daten privat?',
    answer:
      'Ja. Alles wird lokal in deinem Browser verarbeitet. Namen und Gruppendaten werden nicht an einen Server gesendet. Sobald die Seite geladen ist, kannst du sie auch ohne Internetverbindung nutzen.',
  },
  constraints: {
    question: 'Kann ich Regeln wie „zusammen halten“ oder „trennen“ hinzufügen?',
    answer:
      'Ja. In den erweiterten Optionen kannst du Gruppen zusammenhalten, Paarungen vermeiden, mehrere Sessions planen und nach Attributen balancieren. Für noch mehr Kontrolle gibt es den Szenario-Editor.',
  },
  multiSession: {
    question: 'Kann ich Gruppen für mehrere Runden erstellen?',
    answer:
      'Ja. Stelle in den erweiterten Optionen mehrere Sessions ein und aktiviere „Wiederholungen vermeiden“, damit dieselben Personen seltener erneut zusammenkommen.',
  },
  workspace: {
    question: 'Was ist der Szenario-Editor?',
    answer:
      'Der Szenario-Editor ist für Funktionen gedacht, die diese Seite nicht abdeckt: Teilanwesenheit, Kapazitäten nach Gruppe und Session, session-spezifische Regeln, gewichtete weiche Constraints, Zielwerte für Paar-Begegnungen, erweiterte Constraint-Feinsteuerung, Solver-Einstellungen, frühere Ergebnisse und Ergebnisanalyse.',
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
      eyebrow: 'Brauchst du noch mehr Kontrolle?',
      title: 'Öffne den vollständigen Szenario-Editor.',
      featureBullets: OPTIMIZER_FEATURES,
      featureExplanations: OPTIMIZER_FEATURE_EXPLANATIONS,
      buttonLabel: 'Szenario-Editor öffnen',
      supportingText: 'Nutze ihn für Möglichkeiten, die diese Seite nicht abdeckt. Deine Eingaben werden direkt übernommen.',
    },
    faqEntries,
    chrome: CHROME,
    useCasesSection: USE_CASES_SECTION,
  };
}

export const DE_TOOL_PAGE_CONTENT: Partial<Record<ToolPageKey, ToolPageLocalizedContent>> = {
  home: createContent({
    title: 'Zufalls-Gruppengenerator — Namen sofort in Gruppen aufteilen | GroupMixer',
    description:
      'Kostenloser Zufalls-Gruppengenerator. Namen einfügen, Gruppenzahl wählen und in Sekunden ausgewogene Gruppen erstellen. Keine Anmeldung nötig. Bei Bedarf kannst du Regeln hinzufügen.',
    eyebrow: 'Für Unterricht, Workshops und Events',
    heroTitle: 'Zufalls-Gruppengenerator',
    subhead:
      'Namen einfügen, Anzahl der Gruppen wählen und sofort aufteilen.',
    audienceSummary: '',
    faqEntries: [
      {
        question: 'Wie teile ich eine Namensliste zufällig in Gruppen auf?',
        answer:
          'Füge deine Namen zeilenweise ein, stelle die Gruppenzahl oder Gruppengröße ein und klicke auf „Gruppen erstellen“. Die Aufteilung erscheint sofort.',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.constraints,
      FAQS.multiSession,
      FAQS.workspace,
    ],
  }),
};
