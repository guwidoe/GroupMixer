import { defineConfig, devices } from '@playwright/test';

// Use a unique port to avoid conflicts with other dev servers
const TEST_PORT = 5199;

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],
  
  // Visual regression snapshot settings
  snapshotDir: './e2e/snapshots',
  snapshotPathTemplate: '{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}{-projectName}{-snapshotSuffix}{ext}',
  
  // Default expect settings for screenshots
  expect: {
    toHaveScreenshot: {
      // Allow 0.5% pixel difference for minor rendering variations
      maxDiffPixelRatio: 0.005,
      // Animation tolerance
      animations: 'disabled',
      // Scale for consistent screenshots across machines
      scale: 'device',
    },
    toMatchSnapshot: {
      // Allow 0.5% difference for non-image snapshots
      maxDiffPixelRatio: 0.005,
    },
  },
  
  use: {
    baseURL: `http://localhost:${TEST_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Consistent viewport for visual tests
    viewport: { width: 1280, height: 720 },
    // Disable animations for consistent screenshots
    reducedMotion: 'reduce',
  },
  
  projects: [
    // Desktop Chrome - primary visual regression target
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Mobile viewport for responsive testing
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    // Desktop Chrome Dark Mode
    {
      name: 'chromium-dark',
      use: {
        ...devices['Desktop Chrome'],
        colorScheme: 'dark',
      },
    },
  ],
  
  webServer: {
    command: `npm run dev -- --port ${TEST_PORT}`,
    url: `http://localhost:${TEST_PORT}`,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
