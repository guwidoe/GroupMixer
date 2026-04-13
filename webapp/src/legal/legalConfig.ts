export interface SiteLegalConfig {
  siteName: string;
  siteUrl: string;
  ownerName: string;
  residence: string;
  contactEmailLocalPart: string;
  contactEmailDomain: string;
  websitePurpose: string;
  websiteDirection: string;
  analyticsProviderName: string;
  analyticsProviderUrl: string;
  hostingProviderName: string;
  hostingProviderUrl: string;
  issueTrackerUrl: string;
  lastUpdated: string;
}

export function getLegalContactEmail(config: SiteLegalConfig): string {
  return `${config.contactEmailLocalPart}@${config.contactEmailDomain}`;
}

export const SITE_LEGAL_CONFIG: SiteLegalConfig = {
  siteName: 'GroupMixer',
  siteUrl: 'https://www.groupmixer.app',
  ownerName: 'Guido Witt-Dörring',
  residence: 'Mühlgasse 3, 2322 Zwölfaxing, Austria',
  contactEmailLocalPart: 'guwidoe',
  contactEmailDomain: 'gmail.com',
  websitePurpose:
    'Private, nicht-kommerzielle Website zur browserbasierten Erstellung und Optimierung von Gruppen, Teams und Session-Plänen.',
  websiteDirection:
    'Bereitstellung eines privaten, nicht-kommerziellen Webtools samt begleitender Informationen zur Nutzung und zu den Funktionen von GroupMixer.',
  analyticsProviderName: 'Vercel Web Analytics',
  analyticsProviderUrl: 'https://vercel.com/docs/analytics/privacy-policy',
  hostingProviderName: 'Vercel',
  hostingProviderUrl: 'https://vercel.com/legal/privacy-policy',
  issueTrackerUrl: 'https://github.com/guwidoe/GroupMixer/issues',
  lastUpdated: '2026-04-13',
};
