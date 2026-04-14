import { DEFAULT_LOCALE, type SupportedLocale, SUPPORTED_LOCALES, getLocaleHomePath } from '../pages/toolPageConfigs';

export interface LegalContent {
  seoTitle: string;
  seoDescription: string;
  eyebrow: string;
  pageTitle: string;
  intro: string;
  legalNoticeLinkLabel: string;
  privacyLinkLabel: string;
  legalNoticeHeading: string;
  legalNoticeDescription: string;
  ownerLabel: string;
  residenceLabel: string;
  purposeLabel: string;
  purposeValue: string;
  directionLabel: string;
  directionValue: string;
  contactLabel: string;
  privacyHeading: string;
  controllerTitle: string;
  controllerBody: string;
  hostingTitle: string;
  hostingBody1: string;
  hostingBody2: string;
  analyticsTitle: string;
  analyticsBody1: string;
  analyticsBody2: string;
  localStorageTitle: string;
  localStorageBody1: string;
  localStorageBody2: string;
  scenarioDataTitle: string;
  scenarioDataBody: string;
  recipientsTitle: string;
  recipientsBody: string;
  rightsTitle: string;
  rightsBody: string;
  externalReferencesLabel: string;
  updatedLabel: string;
  footerPrivacyNote: string;
  advancedEditorLabel: string;
}

const GERMAN_LEGAL_CONTENT: LegalContent = {
  seoTitle: 'Offenlegung & Datenschutz | GroupMixer',
  seoDescription: 'Offenlegung gemäß österreichischem Medienrecht und Datenschutzhinweise für GroupMixer.',
  eyebrow: 'Rechtliches',
  pageTitle: 'Offenlegung & Datenschutz',
  intro:
    'Diese Seite enthält die wesentlichen rechtlichen Angaben und Datenschutzhinweise für GroupMixer als private, nicht-kommerzielle Website einer natürlichen Person in Österreich.',
  legalNoticeLinkLabel: 'Offenlegung',
  privacyLinkLabel: 'Datenschutz',
  legalNoticeHeading: 'Offenlegung gemäß § 25 MedienG',
  legalNoticeDescription:
    'GroupMixer ist als kleine, private und nicht-kommerzielle Website ausgestaltet. Die folgenden Angaben sind ständig leicht und unmittelbar auffindbar.',
  ownerLabel: 'Medieninhaber / inhaltlich verantwortlich',
  residenceLabel: 'Wohnort',
  purposeLabel: 'Gegenstand der Website',
  purposeValue:
    'Private, nicht-kommerzielle Website zur browserbasierten Erstellung und Optimierung von Gruppen, Teams und Session-Plänen.',
  directionLabel: 'Grundlegende Richtung',
  directionValue:
    'Bereitstellung eines privaten, nicht-kommerziellen Webtools samt begleitender Informationen zur Nutzung und zu den Funktionen von GroupMixer.',
  contactLabel: 'Kontakt',
  privacyHeading: 'Datenschutzhinweise',
  controllerTitle: '1. Verantwortlicher',
  controllerBody:
    'Verantwortlich für diese Website ist {ownerName}, {residence}. Bei Fragen zum Datenschutz oder zur Ausübung Ihrer Rechte erreichen Sie uns unter {email}.',
  hostingTitle: '2. Hosting und technische Serverdaten',
  hostingBody1:
    'Die Website wird über {hostingProviderName} bereitgestellt. Beim Aufruf der Website können technisch erforderliche Verbindungsdaten wie IP-Adresse, Zeitpunkt des Abrufs, angeforderte URL, Referrer-Information, Browser-/Gerätedaten und ähnliche Logdaten verarbeitet werden, um die Website auszuliefern, Sicherheit zu gewährleisten und Missbrauch zu erkennen.',
  hostingBody2:
    'Soweit dabei personenbezogene Daten verarbeitet werden, erfolgt dies auf Grundlage unserer berechtigten Interessen an einem sicheren und stabilen Betrieb der Website (Art. 6 Abs. 1 lit. f DSGVO).',
  analyticsTitle: '4. Web-Analytics',
  analyticsBody1:
    'Diese Website nutzt {analyticsProviderName} in einer möglichst datensparsamen Konfiguration. Laut Anbieter werden dabei keine Drittanbieter-Cookies gesetzt; erfasst werden anonymisierte bzw. aggregierte Nutzungsdaten. Dazu können insbesondere Seitenaufrufe, Route/URL, Referrer, Zeitstempel, grobe Standortdaten (z. B. Land), Browser-, Betriebssystem- und Gerätetyp-Informationen gehören.',
  analyticsBody2:
    'Soweit personenbezogene Daten im Rahmen der Reichweitenmessung verarbeitet werden, erfolgt dies auf Grundlage unserer berechtigten Interessen an der datensparsamen Analyse und Verbesserung der Website (Art. 6 Abs. 1 lit. f DSGVO).',
  localStorageTitle: '5. Browser-lokale Speicherung und Offline-Funktionen',
  localStorageBody1:
    'GroupMixer speichert Entwürfe, Szenarien, Ergebnisse, UI-Zustände und ähnliche Funktionsdaten lokal im Browser (z. B. via localStorage, sessionStorage und Service-Worker-Cache), damit die App wie vorgesehen funktioniert. Diese Daten bleiben grundsätzlich auf dem Endgerät der Nutzerinnen und Nutzer und dienen nicht der serverseitigen Erhebung von Tool-Inhalten.',
  localStorageBody2:
    'Die browserlokale Speicherung erfolgt, um ausdrücklich genutzte Funktionen bereitzustellen – etwa Szenario-Bearbeitung, Wiederherstellung von Entwürfen, Offline-Unterstützung und die Übergabe zwischen Landing-Tool und erweitertem Editor.',
  scenarioDataTitle: '3. Keine Übermittlung von Szenariodaten',
  scenarioDataBody:
    'Diese Website bietet derzeit keine Nutzerkonten, keine Newsletter-Anmeldung und kein Kontaktformular an. Die Website stellt keine Funktion bereit, eingegebene Teilnehmernamen oder Szenariodaten an unsere Server oder an von uns kontrollierte Backend-Dienste zu übermitteln. Diese Daten verbleiben ausnahmslos am Gerät der Nutzerinnen und Nutzer.',
  recipientsTitle: '6. Empfänger und Speicherdauer',
  recipientsBody:
    'Externer technischer Empfänger ist vor allem {hostingProviderName} für Hosting, Auslieferung und Analytics. Soweit wir auf Speicherdauern Einfluss haben, werden Daten nur so lange verarbeitet, wie dies für sicheren Betrieb, Fehleranalyse und datensparsame Reichweitenmessung erforderlich ist. Im Übrigen gelten die Speicher- und Löschfristen des eingesetzten Anbieters.',
  rightsTitle: '7. Datenschutzrechte',
  rightsBody:
    'Soweit im Einzelfall personenbezogene Daten im Zusammenhang mit Hosting, Logdaten oder Reichweitenmessung verarbeitet werden, stehen Ihnen die gesetzlichen Datenschutzrechte zu, insbesondere auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch. Außerdem besteht das Recht, sich bei der österreichischen Datenschutzbehörde zu beschweren.',
  externalReferencesLabel: 'Externe Hinweise',
  updatedLabel: 'Stand',
  footerPrivacyNote: 'Ihre Szenariodaten bleiben in Ihrem Browser; Details finden Sie in Offenlegung und Datenschutz.',
  advancedEditorLabel: 'Szenario-Editor',
};

const ENGLISH_LEGAL_CONTENT: LegalContent = {
  seoTitle: 'Legal notice & privacy | GroupMixer',
  seoDescription: 'Legal notice under Austrian law and privacy information for GroupMixer.',
  eyebrow: 'Legal',
  pageTitle: 'Legal notice & privacy',
  intro:
    'This page contains the core legal notice and privacy information for GroupMixer as a private, non-commercial website operated by a natural person in Austria.',
  legalNoticeLinkLabel: 'Legal notice',
  privacyLinkLabel: 'Privacy',
  legalNoticeHeading: 'Legal notice under Austrian media law',
  legalNoticeDescription:
    'GroupMixer is structured as a small, private and non-commercial website. The following information is provided in a permanently easy and direct form.',
  ownerLabel: 'Owner / content responsibility',
  residenceLabel: 'Place of residence',
  purposeLabel: 'Purpose of the website',
  purposeValue:
    'Private, non-commercial website for browser-based creation and optimisation of groups, teams and session plans.',
  directionLabel: 'Editorial direction',
  directionValue:
    'Provision of a private, non-commercial web tool together with accompanying information about the use and capabilities of GroupMixer.',
  contactLabel: 'Contact',
  privacyHeading: 'Privacy information',
  controllerTitle: '1. Controller',
  controllerBody:
    'The controller for this website is {ownerName}, {residence}. For privacy-related questions or to exercise your rights, you can contact us at {email}.',
  hostingTitle: '2. Hosting and technical server data',
  hostingBody1:
    'This website is provided through {hostingProviderName}. When the website is accessed, technically required connection data such as IP address, access time, requested URL, referrer information, browser/device data and similar log data may be processed to deliver the website, ensure security and detect misuse.',
  hostingBody2:
    'Where personal data is processed in this context, the legal basis is our legitimate interest in the secure and stable operation of the website (Art. 6(1)(f) GDPR).',
  analyticsTitle: '4. Web analytics',
  analyticsBody1:
    'This website uses {analyticsProviderName} in a deliberately data-minimised configuration. According to the provider, no third-party cookies are set; anonymised or aggregated usage data may be processed instead. This may include page views, route/URL, referrer, timestamps, coarse location data (for example country), browser, operating system and device type information.',
  analyticsBody2:
    'Where personal data is processed for reach measurement, the legal basis is our legitimate interest in a privacy-friendly analysis and improvement of the website (Art. 6(1)(f) GDPR).',
  localStorageTitle: '5. Browser-local storage and offline functions',
  localStorageBody1:
    'GroupMixer stores drafts, scenarios, results, UI state and similar functional data locally in the browser (for example via localStorage, sessionStorage and the service worker cache) so that the app works as intended. This data generally remains on the user’s device and is not used for server-side collection of tool content.',
  localStorageBody2:
    'This browser-local storage is used to provide explicitly requested functionality, such as scenario editing, draft recovery, offline support and handoff between the landing tool and the scenario editor.',
  scenarioDataTitle: '3. No transmission of scenario data',
  scenarioDataBody:
    'This website currently does not provide user accounts, newsletter sign-up or a contact form. The website does not provide any function that transmits entered participant names or scenario data to our servers or to backend services under our control. This data remains exclusively on the users\' devices.',
  recipientsTitle: '6. Recipients and storage periods',
  recipientsBody:
    'The main external technical recipient is {hostingProviderName} for hosting, delivery and analytics. Where we can influence storage periods, data is only processed for as long as necessary for secure operation, error analysis and privacy-friendly reach measurement. Otherwise, the provider’s retention and deletion rules apply.',
  rightsTitle: '7. Data protection rights',
  rightsBody:
    'Where personal data is processed in individual cases in connection with hosting, log data or reach measurement, the statutory data protection rights apply, in particular rights of access, rectification, erasure, restriction of processing, data portability and objection. You also have the right to lodge a complaint with the Austrian Data Protection Authority.',
  externalReferencesLabel: 'External references',
  updatedLabel: 'Last updated',
  footerPrivacyNote: 'Your scenario data stays in your browser; details are in the legal notice and privacy page.',
  advancedEditorLabel: 'Scenario editor',
};

export function resolveLegalLocale(locale: SupportedLocale): 'de' | 'en' {
  return locale === 'de' ? 'de' : 'en';
}

export function getLegalContent(locale: SupportedLocale): LegalContent {
  return resolveLegalLocale(locale) === 'de' ? GERMAN_LEGAL_CONTENT : ENGLISH_LEGAL_CONTENT;
}

export function buildLegalPath(locale: SupportedLocale): string {
  return locale === DEFAULT_LOCALE ? '/legal' : `/${locale}/legal`;
}

export function resolveLegalPathLocale(pathname: string): SupportedLocale {
  const match = pathname.match(/^\/([a-z]{2})(?:\/|$)/i);
  const maybeLocale = match?.[1];
  if (maybeLocale && (SUPPORTED_LOCALES as readonly string[]).includes(maybeLocale)) {
    return maybeLocale as SupportedLocale;
  }
  return DEFAULT_LOCALE;
}

export function getLegalHomePath(locale: SupportedLocale): string {
  return getLocaleHomePath(locale);
}
