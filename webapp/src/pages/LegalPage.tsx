import { useEffect } from 'react';
import { AppHeader } from '../components/AppHeader';
import { ObfuscatedEmailLink } from '../components/ObfuscatedEmailLink';
import { LandingFooter } from '../components/LandingPage/LandingFooter';
import { Seo } from '../components/Seo';
import { SITE_LEGAL_CONFIG } from '../legal/legalConfig';

export default function LegalPage() {
  useEffect(() => {
    if (!window.location.hash) {
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }

    const id = window.location.hash.slice(1);
    const element = document.getElementById(id);
    if (!element) {
      return;
    }

    window.setTimeout(() => {
      element.scrollIntoView({ behavior: 'auto', block: 'start' });
    }, 0);
  }, []);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
      <Seo
        title="Offenlegung & Datenschutz | GroupMixer"
        description="Offenlegung gemäß österreichischem Medienrecht und Datenschutzhinweise für GroupMixer."
        canonicalPath="/legal"
      />

      <AppHeader homeTo="/" hideDesktopUtilityRail title="GroupMixer" />

      <main className="px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section
            className="rounded-2xl border p-6 sm:p-8"
            style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
          >
            <p className="text-sm font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-secondary)' }}>
              Rechtliches
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Offenlegung & Datenschutz
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 sm:text-base" style={{ color: 'var(--text-secondary)' }}>
              Diese Seite bündelt die wesentlichen rechtlichen Angaben für GroupMixer als private, nicht-kommerzielle Website
              einer natürlichen Person in Österreich. Bitte ergänze vor der Veröffentlichung die markierten Platzhalter für
              Wohnort und Kontakt-E-Mail in <code>webapp/src/legal/legalConfig.ts</code>.
            </p>
          </section>

          <section
            id="offenlegung"
            className="rounded-2xl border p-6 sm:p-8"
            style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
          >
            <h2 className="text-2xl font-semibold tracking-tight">Offenlegung gemäß § 25 MedienG</h2>
            <p className="mt-3 text-sm leading-7 sm:text-base" style={{ color: 'var(--text-secondary)' }}>
              GroupMixer ist als kleine, private und nicht-kommerzielle Website ausgestaltet. Die folgenden Angaben sollen
              ständig leicht und unmittelbar auffindbar sein.
            </p>

            <dl className="mt-6 grid gap-4 sm:grid-cols-[minmax(12rem,15rem)_1fr] sm:gap-x-6 sm:gap-y-5">
              <dt className="font-semibold">Medieninhaber / inhaltlich verantwortlich</dt>
              <dd>{SITE_LEGAL_CONFIG.ownerName}</dd>

              <dt className="font-semibold">Wohnort</dt>
              <dd>{SITE_LEGAL_CONFIG.residence}</dd>

              <dt className="font-semibold">Gegenstand der Website</dt>
              <dd>{SITE_LEGAL_CONFIG.websitePurpose}</dd>

              <dt className="font-semibold">Grundlegende Richtung</dt>
              <dd>{SITE_LEGAL_CONFIG.websiteDirection}</dd>

              <dt className="font-semibold">Kontakt</dt>
              <dd>
                <ObfuscatedEmailLink
                  localPart={SITE_LEGAL_CONFIG.contactEmailLocalPart}
                  domain={SITE_LEGAL_CONFIG.contactEmailDomain}
                />
              </dd>
            </dl>
          </section>

          <section
            id="privacy"
            className="rounded-2xl border p-6 sm:p-8"
            style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
          >
            <h2 className="text-2xl font-semibold tracking-tight">Datenschutzhinweise</h2>
            <div className="mt-6 space-y-7 text-sm leading-7 sm:text-base">
              <section>
                <h3 className="text-lg font-semibold">1. Verantwortlicher</h3>
                <p style={{ color: 'var(--text-secondary)' }}>
                  Verantwortlich für diese Website ist {SITE_LEGAL_CONFIG.ownerName}, {SITE_LEGAL_CONFIG.residence}. Bei
                  Fragen zum Datenschutz oder zur Ausübung deiner Rechte kannst du mich unter{' '}
                  <ObfuscatedEmailLink
                    localPart={SITE_LEGAL_CONFIG.contactEmailLocalPart}
                    domain={SITE_LEGAL_CONFIG.contactEmailDomain}
                  />{' '}
                  kontaktieren.
                </p>
              </section>

              <section>
                <h3 className="text-lg font-semibold">2. Hosting und technische Serverdaten</h3>
                <p style={{ color: 'var(--text-secondary)' }}>
                  Die Website wird über {SITE_LEGAL_CONFIG.hostingProviderName} bereitgestellt. Beim Aufruf der Website können
                  technisch erforderliche Verbindungsdaten wie IP-Adresse, Zeitpunkt des Abrufs, angeforderte URL,
                  Referrer-Information, Browser-/Gerätedaten und ähnliche Logdaten verarbeitet werden, um die Website
                  auszuliefern, Sicherheit zu gewährleisten und Missbrauch zu erkennen.
                </p>
                <p className="mt-3" style={{ color: 'var(--text-secondary)' }}>
                  Soweit dabei personenbezogene Daten verarbeitet werden, erfolgt dies auf Grundlage meines berechtigten
                  Interesses an einem sicheren und stabilen Betrieb der Website (Art. 6 Abs. 1 lit. f DSGVO).
                </p>
              </section>

              <section>
                <h3 className="text-lg font-semibold">3. Web-Analytics</h3>
                <p style={{ color: 'var(--text-secondary)' }}>
                  Diese Website nutzt {SITE_LEGAL_CONFIG.analyticsProviderName} in einer möglichst datensparsamen
                  Konfiguration. Laut Anbieter werden dabei keine Drittanbieter-Cookies gesetzt; erfasst werden anonymisierte
                  bzw. aggregierte Nutzungsdaten. Dazu können insbesondere Seitenaufrufe, Route/URL, Referrer, Zeitstempel,
                  grobe Standortdaten (z. B. Land), Browser-, Betriebssystem- und Gerätetyp-Informationen gehören.
                </p>
                <p className="mt-3" style={{ color: 'var(--text-secondary)' }}>
                  Es werden keine benutzerdefinierten Analytics-Ereignisse für eingegebene Szenariodaten, Gruppenergebnisse
                  oder ähnliche Tool-Inhalte an mich übertragen. Nicht als Analytics-Inhalt übertragen werden nach aktuellem
                  Stand insbesondere eingegebene Namen, Szenarioinhalte, Gruppenzusammenstellungen oder exportierte Dateien.
                  Soweit personenbezogene Daten im Rahmen der Reichweitenmessung verarbeitet werden, erfolgt dies auf
                  Grundlage meines berechtigten Interesses an der datensparsamen Analyse und Verbesserung der Website
                  (Art. 6 Abs. 1 lit. f DSGVO).
                </p>
              </section>

              <section>
                <h3 className="text-lg font-semibold">4. Browser-lokale Speicherung und Offline-Funktionen</h3>
                <p style={{ color: 'var(--text-secondary)' }}>
                  GroupMixer speichert Entwürfe, Szenarien, Ergebnisse, UI-Zustände und ähnliche Funktionsdaten lokal in deinem
                  Browser (z. B. via localStorage, sessionStorage und Service-Worker-Cache), damit die App wie gewünscht
                  funktioniert. Diese Daten bleiben grundsätzlich auf deinem Endgerät und dienen nicht dazu, von mir
                  personenbezogene Inhalte einzusammeln.
                </p>
                <p className="mt-3" style={{ color: 'var(--text-secondary)' }}>
                  Die browserlokale Speicherung erfolgt, um von dir ausdrücklich genutzte Funktionen bereitzustellen – etwa
                  Szenario-Bearbeitung, Wiederherstellung von Entwürfen, Offline-Unterstützung und die Übergabe zwischen
                  Landing-Tool und erweitertem Editor.
                </p>
              </section>

              <section>
                <h3 className="text-lg font-semibold">5. Keine Nutzerkonten, keine Formulare, keine Weitergabe von Szenariodaten</h3>
                <p style={{ color: 'var(--text-secondary)' }}>
                  Diese Website bietet derzeit keine Nutzerkonten, keine Newsletter-Anmeldung und kein Kontaktformular an.
                  Eingegebene Teilnehmernamen und Szenariodaten werden nach aktuellem Stand nicht serverseitig gespeichert und
                  nicht als Teil der Kernfunktion an mich übermittelt.
                </p>
              </section>

              <section>
                <h3 className="text-lg font-semibold">6. Empfänger und Speicherdauer</h3>
                <p style={{ color: 'var(--text-secondary)' }}>
                  Externer technischer Empfänger ist vor allem {SITE_LEGAL_CONFIG.hostingProviderName} für Hosting,
                  Auslieferung und Analytics. Soweit ich auf Speicherdauern Einfluss habe, werden Daten nur so lange
                  verarbeitet, wie dies für sicheren Betrieb, Fehleranalyse und datensparsame Reichweitenmessung erforderlich
                  ist. Im Übrigen gelten die Speicher- und Löschfristen des eingesetzten Anbieters.
                </p>
              </section>

              <section>
                <h3 className="text-lg font-semibold">7. Deine Rechte</h3>
                <p style={{ color: 'var(--text-secondary)' }}>
                  Dir stehen – soweit die gesetzlichen Voraussetzungen vorliegen – insbesondere die Rechte auf Auskunft,
                  Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch zu. Wenn du der
                  Ansicht bist, dass die Verarbeitung deiner Daten gegen Datenschutzrecht verstößt, kannst du dich außerdem an
                  die österreichische Datenschutzbehörde wenden.
                </p>
              </section>
            </div>
          </section>

          <section
            className="rounded-2xl border p-6 sm:p-8 text-sm leading-7"
            style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
          >
            <p>
              Externe Hinweise: <a href={SITE_LEGAL_CONFIG.analyticsProviderUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{SITE_LEGAL_CONFIG.analyticsProviderName}</a>,{' '}
              <a href={SITE_LEGAL_CONFIG.hostingProviderUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{SITE_LEGAL_CONFIG.hostingProviderName}</a>,{' '}
              <a href={SITE_LEGAL_CONFIG.issueTrackerUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">GitHub Issues</a>
            </p>
            <p className="mt-3">Stand: {SITE_LEGAL_CONFIG.lastUpdated}</p>
          </section>
        </div>
      </main>

      <LandingFooter
        expertWorkspaceTo="/app"
        expertWorkspaceLabel="Advanced editor"
        privacyNote="Deine Szenariodaten bleiben in deinem Browser; Details findest du in Offenlegung und Datenschutz."
      />
    </div>
  );
}
