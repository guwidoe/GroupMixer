import type { SupportedLocale } from '../pages/toolPageTypes';

export const LANDING_SAMPLE_NAMES_BY_LOCALE: Record<SupportedLocale, string[]> = {
  en: ['Alex', 'Sam', 'Ella', 'Jordan', 'Mina', 'Luis', 'Taylor', 'Casey'],
  de: ['Muller', 'Schmidt', 'Weber', 'Wagner', 'Hoffmann', 'Schafer', 'Koch', 'Richter'],
  es: ['Garcia', 'Lopez', 'Martinez', 'Sanchez', 'Gonzalez', 'Perez', 'Rodriguez', 'Fernandez'],
  fr: ['Martin', 'Bernard', 'Thomas', 'Petit', 'Robert', 'Richard', 'Dubois', 'Moreau'],
  ja: ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村'],
  hi: ['Sharma', 'Verma', 'Singh', 'Patel', 'Gupta', 'Kumar', 'Reddy', 'Nair'],
  zh: ['王', '李', '张', '刘', '陈', '杨', '赵', '黄'],
};

export function getLandingSampleNamesText(locale: SupportedLocale): string {
  return LANDING_SAMPLE_NAMES_BY_LOCALE[locale].join('\n');
}

export function getLandingSampleCsvText(locale: SupportedLocale): string {
  const names = LANDING_SAMPLE_NAMES_BY_LOCALE[locale];
  return [
    'name,team,role',
    `${names[0]},Blue,Engineer`,
    `${names[1]},Blue,Designer`,
    `${names[2]},Gold,Engineer`,
    `${names[3]},Gold,Facilitator`,
    `${names[4]},Green,Research`,
    `${names[5]},Green,Engineer`,
  ].join('\n');
}
