import { test, expect } from '@playwright/test'
import { createProject, findProjectLink } from './project-flows'

// Small, deliberately linear journey covering only what the preview-smoke
// workflow needs to prove: the deployed target is up, serves its real UI,
// and the core create -> persist -> navigate path works end to end. Not a
// substitute for the full local suite — see add-e2e-test SKILL.md's
// "Local full-suite and remote smoke responsibilities are distinct" note.
test(
  'preview is healthy and the core project journey works',
  { tag: '@preview-smoke' },
  async ({ page, request }) => {
    const health = await request.get('/health')
    expect(health.ok()).toBeTruthy()

    await page.goto('/projects')
    await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible()

    const uniqueName = `Preview Smoke ${crypto.randomUUID()}`
    await createProject(page, uniqueName)

    // Reload proves persistence, not just in-memory/query-cache state.
    await page.reload()
    const projectLink = await findProjectLink(page, uniqueName)

    // The project row's own link IS the task list route (projects/:projectId
    // renders TaskListPage directly — see src/TaskFlow.Web/src/routes.tsx).
    await projectLink.click()
    await expect(page.getByRole('heading', { name: uniqueName, level: 1 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'No tasks yet' })).toBeVisible()
  },
)
