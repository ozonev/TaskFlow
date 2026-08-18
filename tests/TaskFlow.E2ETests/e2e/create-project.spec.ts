import { test, expect } from '@playwright/test'
import { createProject, findProjectLink } from './project-flows'

test('creating a project persists across reload', { tag: '@preview-smoke' }, async ({ page }) => {
  const uniqueName = `E2E Project ${crypto.randomUUID()}`

  await page.goto('/projects')
  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible()

  await createProject(page, uniqueName, 'Created by Playwright E2E')
  await findProjectLink(page, uniqueName)

  // Reload proves persistence, not React/query-cache state: both
  // .env.development's and .env.production's VITE_API_BASE_URL are truthy,
  // so the real HTTP client is always used (never the mock-client fallback
  // in src/api/index.ts) — true whether this runs locally or, via the
  // @preview-smoke tag, against the preview target's built bundle.
  await page.reload()
  await findProjectLink(page, uniqueName)
})
