import { test, expect } from '@playwright/test'

test('creating a project persists across reload', async ({ page }) => {
  const uniqueName = `E2E Project ${crypto.randomUUID()}`

  await page.goto('/projects')
  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible()

  // "New project" is a <Link role="link">, rendered twice on an empty list
  // (header action + empty-state action) — disambiguate with .first().
  await page.getByRole('link', { name: 'New project' }).first().click()

  const dialog = page.getByRole('dialog', { name: 'New project' })
  await dialog.getByRole('textbox', { name: 'Name' }).fill(uniqueName)
  await dialog.getByRole('textbox', { name: 'Description' }).fill('Created by Playwright E2E')
  await dialog.getByRole('button', { name: 'Create project' }).click()

  await expect(page.getByRole('status').filter({ hasText: `"${uniqueName}" created` })).toBeVisible()
  await expect(dialog).not.toBeVisible()
  // Assumes this project lands on page 1 (list is ordered ascending by
  // CreatedAtUtc, DEFAULT_PAGE_SIZE=20) — holds as long as the run's total
  // project count stays under 20. See add-e2e-test SKILL.md step 2 before
  // adding a spec that could push the cumulative total past that.
  await expect(page.getByRole('link', { name: uniqueName })).toBeVisible()

  // Reload proves SQLite-backed persistence, not React/query-cache state:
  // .env.development's VITE_API_BASE_URL is truthy, so the real HTTP client
  // is always used (never the mock-client fallback in src/api/index.ts).
  await page.reload()
  await expect(page.getByRole('link', { name: uniqueName })).toBeVisible()
})
