import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LandingLanguageSelector } from './LandingLanguageSelector';

describe('LandingLanguageSelector', () => {
  it('navigates to the selected locale path while preserving the shared route shape', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/es/random-team-generator?exp=seo-test&var=B']}>
        <Routes>
          <Route
            path="/es/random-team-generator"
            element={
              <LandingLanguageSelector
                currentLocale="es"
                options={[
                  { locale: 'en', label: 'English', to: '/random-team-generator?exp=seo-test&var=B' },
                  { locale: 'es', label: 'Español', to: '/es/random-team-generator?exp=seo-test&var=B' },
                  { locale: 'de', label: 'Deutsch', to: '/de/random-team-generator?exp=seo-test&var=B' },
                ]}
              />
            }
          />
          <Route path="/de/random-team-generator" element={<div>German destination</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.selectOptions(screen.getByRole('combobox', { name: /language/i }), 'de');

    expect(await screen.findByText('German destination')).toBeInTheDocument();
  });

  it('does not render when only one locale is available', () => {
    render(
      <MemoryRouter>
        <LandingLanguageSelector
          currentLocale="en"
          options={[{ locale: 'en', label: 'English', to: '/' }]}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('combobox', { name: /language/i })).not.toBeInTheDocument();
  });
});
