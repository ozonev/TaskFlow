import { expect, type Locator, type Page } from '@playwright/test'

// Shared by create-project.spec.ts and preview-smoke.spec.ts — not a
// *.spec.ts file itself, so Playwright's default testMatch doesn't pick it
// up as a suite.

export async function createProject(page: Page, name: string, description?: string): Promise<void> {
  // "New project" is a <Link role="link">, rendered twice on an empty list
  // (header action + empty-state action) — disambiguate with .first().
  await page.getByRole('link', { name: 'New project' }).first().click()

  const dialog = page.getByRole('dialog', { name: 'New project' })
  await dialog.getByRole('textbox', { name: 'Name' }).fill(name)
  if (description) {
    await dialog.getByRole('textbox', { name: 'Description' }).fill(description)
  }
  await dialog.getByRole('button', { name: 'Create project' }).click()

  await expect(page.getByRole('status').filter({ hasText: `"${name}" created` })).toBeVisible()
  await expect(dialog).not.toBeVisible()
}

/**
 * The project list orders ascending by CreatedAtUtc with a fixed page size
 * (DEFAULT_PAGE_SIZE=20), so a just-created project lands on the LAST page,
 * not necessarily page 1, once the cumulative total exceeds that. Locally
 * this only bites once several specs share one run; against the preview
 * environment it bites on essentially every run, since its Postgres
 * database is never reset between runs (docs/architecture/
 * preview-environment.md) and only ever grows. Always resolve the real
 * page instead of assuming page 1.
 */
export async function findProjectLink(page: Page, name: string): Promise<Locator> {
  const link = page.getByRole('link', { name })
  if (await link.isVisible()) {
    return link
  }

  const captionText = await page.locator('caption').textContent()
  const totalPages = Number(captionText?.match(/page \d+ of (\d+)/)?.[1] ?? 1)
  await page.goto(`/projects?page=${totalPages}`)

  await expect(link).toBeVisible()
  return link
}
