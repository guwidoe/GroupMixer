import type { ToolPageKey, ToolPageLocalizedContent } from '../../pages/toolPageTypes';

const TRUST_BULLETS = [
  'Privat (alles bleibt im Browser)',
  'Keine Anmeldung',
  'Ergebnisse in Sekunden',
];

const OPTIMIZER_FEATURES = [
  'Teilweise Anwesenheit',
  'Session-spezifische Gruppen',
  'Session-spezifische Regeln',
  'Granulare harte + weiche Constraints',
  'Solver-Einstellungen',
  'Detaillierte Ergebnisanalyse',
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
      'Der Szenario-Editor ist für Funktionen gedacht, die diese Seite nicht abdeckt: Teilanwesenheit, session-spezifische Gruppensets, session-spezifische Regeln, granulare harte und weiche Constraints, Solver-Einstellungen, frühere Ergebnisse und detaillierte Analyse.',
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
  'random-group-generator': createContent({
    title: 'Zufalls-Gruppengenerator — Gruppen aus einer Namensliste erstellen | GroupMixer',
    description:
      'Kostenloser Zufalls-Gruppengenerator. Namensliste einfügen, Gruppenzahl wählen und sofort aufteilen. Ideal für Klassen, Workshops und Veranstaltungen.',
    eyebrow: 'Für schnelle Zufallsaufteilungen',
    heroTitle: 'Zufalls-Gruppengenerator',
    subhead:
      'Füge eine Namensliste ein, wähle die gewünschte Gruppenzahl und teile sofort auf. Keine Anmeldung, kein Server — alles läuft im Browser.',
    audienceSummary:
      'Ideal, wenn du schnell und ohne Aufwand Gruppen für Unterricht, Workshops oder Event-Logistik erstellen willst.',
    faqEntries: [
      {
        question: 'Wie funktioniert der Zufalls-Gruppengenerator?',
        answer:
          'Füge die Namen zeilenweise ein, stelle Gruppenzahl oder Gruppengröße ein und klicke auf Generieren. GroupMixer erstellt sofort eine ausgewogene Zufallsaufteilung.',
      },
      {
        question: 'Kann ich die Anzahl der Gruppen oder die Gruppengröße festlegen?',
        answer:
          'Ja. Du kannst entweder eine feste Gruppenzahl oder eine feste Gruppengröße vorgeben. GroupMixer übernimmt den Rest.',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.constraints,
    ],
  }),
  'random-team-generator': createContent({
    title: 'Zufalls-Teamgenerator — Faire Teams schnell erstellen | GroupMixer',
    description:
      'Kostenloser Zufalls-Teamgenerator. Namen einfügen und sofort ausgewogene Teams erstellen. Bei Bedarf kannst du Skills, Rollen oder Regeln berücksichtigen.',
    eyebrow: 'Für Coaches, Leads und Facilitator:innen',
    heroTitle: 'Zufalls-Teamgenerator',
    subhead:
      'Erstelle in Sekunden zufällige Teams. Namen einfügen, Teamanzahl wählen und generieren. Für mehr Fairness kannst du Regeln ergänzen.',
    audienceSummary:
      'Ideal für teamorientierte Aktivitäten, bei denen Fairness wichtiger ist als reine Zufälligkeit — besonders wenn Rollen oder Fähigkeiten verteilt werden sollen.',
    faqEntries: [
      {
        question: 'Wie erstelle ich zufällige Teams?',
        answer:
          'Füge die Namen der Teilnehmenden ein, wähle die Anzahl der Teams und klicke auf Generieren. GroupMixer teilt sofort fair auf.',
      },
      {
        question: 'Kann ich Teams nach Skill oder Rolle balancieren?',
        answer:
          'Ja. Wechsle in den CSV-Modus, ergänze Spalten wie „Rolle“ oder „Skill“ und nutze dann die Balancierung nach Attribut.',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.multiSession,
    ],
  }),
  'breakout-room-generator': createContent({
    title: 'Breakout-Room-Generator — Teilnehmende auf Räume verteilen | GroupMixer',
    description:
      'Kostenloser Breakout-Room-Generator. Namen einfügen und Teilnehmende sofort auf Räume verteilen. Ideal für Unterricht, Workshops und Remote-Meetings.',
    eyebrow: 'Für Zoom, Trainings und Workshops',
    heroTitle: 'Breakout-Room-Generator',
    subhead:
      'Verteile Teilnehmende sofort auf Breakout-Räume. Namen einfügen, Raumanzahl festlegen und generieren.',
    audienceSummary:
      'Praktisch, wenn du Räume schnell zuweisen willst, aber trotzdem Rundenrotationen und weniger Wiederholungen brauchst.',
    faqEntries: [
      {
        question: 'Wie erstelle ich Breakout-Rooms?',
        answer:
          'Füge die Teilnehmenden ein, wähle die Anzahl der Räume und klicke auf Generieren. GroupMixer verteilt alle sofort auf die Räume.',
      },
      {
        question: 'Kann ich Personen über mehrere Runden rotieren lassen?',
        answer:
          'Ja. Lege mehrere Sessions fest und aktiviere „Wiederholungen vermeiden“, damit Menschen möglichst neue Kontakte treffen.',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.constraints,
    ],
  }),
  'workshop-group-generator': createContent({
    title: 'Workshop-Gruppengenerator — Kleine Gruppen für Sessions erstellen | GroupMixer',
    description:
      'Kostenloser Workshop-Gruppengenerator. Teile Teilnehmende für Aktivitäten, Breakouts und mehrstufige Sessions in kleine Gruppen ein. Regeln lassen sich bei Bedarf ergänzen.',
    eyebrow: 'Für Facilitator:innen kollaborativer Sessions',
    heroTitle: 'Workshop-Gruppengenerator',
    subhead:
      'Erstelle Workshop-Gruppen in Sekunden. Starte einfach und ergänze bei Bedarf Runden, Balance oder Pairing-Regeln.',
    audienceSummary:
      'Besonders nützlich für Workshops, bei denen die Gruppenzusammensetzung die Qualität der Gespräche und Begegnungen beeinflusst.',
    faqEntries: [
      {
        question: 'Wie erstelle ich Workshop-Gruppen?',
        answer:
          'Füge die Namen der Teilnehmenden ein, stelle Gruppenzahl oder Gruppengröße ein und klicke auf Generieren. Die Gruppen sind sofort einsatzbereit.',
      },
      {
        question: 'Kann ich Personen zwischen Workshop-Runden durchmischen?',
        answer:
          'Ja. Mit mehreren Sessions und der Vermeidung von Wiederholungen triffst du über die Agenda hinweg häufiger neue Kombinationen.',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.constraints,
    ],
  }),
  'student-group-generator': createContent({
    title: 'Schülergruppen-Generator — Klassen schnell in Gruppen einteilen | GroupMixer',
    description:
      'Kostenloser Schülergruppen-Generator. Klassenliste einfügen und in Sekunden ausgewogene Gruppen bilden. Bei Bedarf kannst du festlegen, wer zusammen oder getrennt bleiben soll.',
    eyebrow: 'Für Lehrkräfte und Unterrichtssituationen',
    heroTitle: 'Schülergruppen-Generator',
    subhead:
      'Füge deine Klassenliste ein und erstelle sofort Gruppen. Bei Bedarf ergänzt du Regeln wie „zusammen halten“ oder „trennen“.',
    audienceSummary:
      'Gemacht für Lehrkräfte, die Gruppen schnell erstellen möchten, ohne Kontrolle über Fairness und sensible Kombinationen zu verlieren.',
    faqEntries: [
      {
        question: 'Wie erstelle ich Schülergruppen?',
        answer:
          'Füge die Schülernamen zeilenweise ein, wähle die Anzahl der Gruppen und klicke auf Generieren. GroupMixer übernimmt den Rest.',
      },
      {
        question: 'Kann ich bestimmte Schüler:innen zusammen oder getrennt halten?',
        answer:
          'Ja. In den erweiterten Optionen kannst du „zusammen halten“ und „nicht zusammen“ festlegen.',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.multiSession,
    ],
  }),
  'speed-networking-generator': createContent({
    title: 'Speed-Networking-Generator — Mehrere Runden, weniger Wiederholungen | GroupMixer',
    description:
      'Kostenloser Speed-Networking-Generator. Erstelle mehrere Runden, in denen Teilnehmende möglichst oft neue Menschen treffen. Wiederholungen werden automatisch reduziert.',
    eyebrow: 'Für Mixer, Meetups und Networking-Formate',
    heroTitle: 'Speed-Networking-Generator',
    subhead:
      'Erzeuge mehrere Networking-Runden, damit Menschen jedes Mal neue Kontakte treffen. Namen einfügen, Runden festlegen und Wiederholungen minimieren.',
    audienceSummary:
      'Optimal für strukturierte Networking-Formate, bei denen neue Verbindungen wichtiger sind als dieselben kleinen Gruppen.',
    faqEntries: [
      {
        question: 'Wie funktioniert der Speed-Networking-Generator?',
        answer:
          'Füge die Namen der Teilnehmenden ein, stelle die Anzahl der Runden ein und aktiviere „Wiederholungen vermeiden“. GroupMixer erstellt dann passende Gruppen für jede Runde.',
      },
      {
        question: 'Kann ich die Gruppengröße steuern?',
        answer:
          'Ja. Du kannst entweder die Anzahl der Gruppen pro Runde oder die Personen pro Gruppe festlegen.',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.workspace,
    ],
  }),
};
