import { defineConfig, devices } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..')
const dbPath = path.join(__dirname, '.tmp', 'e2e.db')

// Cleanup must run exactly once, before the API webServer starts — NOT in
// globalSetup, which Playwright runs AFTER webServer is already up (lifecycle
// is runnerSetup -> webServer -> globalSetup -> tests -> globalTeardown ->
// runnerTeardown). This config file is re-imported in every worker process,
// so guard on TEST_WORKER_INDEX (unset only in the main process) to avoid
// deleting the live DB out from under a running worker.
if (process.env.TEST_WORKER_INDEX === undefined) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  for (const suffix of ['', '-shm', '-wal', '-journal']) {
    fs.rmSync(dbPath + suffix, { force: true })
  }
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Not yet exercised by any CI job — a retry that fails identically is
  // evidence against timing, a retry that passes is evidence for it.
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { outputFolder: 'playwright-report' }], ['list']],
  use: {
    baseURL: 'http://localhost:5273',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // CORS (appsettings.Development.json) is hardcoded to
      // http://localhost:5273 — if either port changes, update both together.
      command:
        'dotnet run --project src/TaskFlow.Api --no-launch-profile --urls http://localhost:5274',
      cwd: repoRoot,
      url: 'http://localhost:5274/health',
      reuseExistingServer: false,
      timeout: 120_000,
      // Explicit (not just relying on Playwright's default) so a startup
      // crash's stack trace always reaches the terminal/CI log — confirmed
      // via a deliberate bad-connection-string exercise that this is the
      // only durable record of such a failure; Playwright attaches no
      // trace/screenshot for a webServer that never started.
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ASPNETCORE_ENVIRONMENT: 'Development',
        ConnectionStrings__DefaultConnection: `Data Source=${dbPath}`,
      },
    },
    {
      command: 'npm run dev',
      cwd: path.join(repoRoot, 'src', 'TaskFlow.Web'),
      url: 'http://localhost:5273',
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
})
