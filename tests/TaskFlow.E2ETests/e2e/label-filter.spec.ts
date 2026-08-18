import { test, expect } from '@playwright/test'
import { createProject, findProjectLink } from './project-flows'

// TASKFLOW-9: create a project, create a label, create a task, assign the
// label, filter the task list by it, and prove persistence across reload.
test(
  'labeling a task: create a label, assign it, filter by it, and reload',
  { tag: '@preview-smoke' },
  async ({ page }) => {
    const projectName = `E2E Label Project ${crypto.randomUUID()}`
    const labelName = `Urgent ${crypto.randomUUID()}`
    const taskTitle = `Labeled task ${crypto.randomUUID()}`

    await page.goto('/projects')
    await createProject(page, projectName)
    const projectLink = await findProjectLink(page, projectName)
    await projectLink.click()
    await expect(page.getByRole('heading', { name: projectName, level: 1 })).toBeVisible()

    // "New task" renders twice on an empty task list (header action + empty-state
    // action) — disambiguate with .first(), same as "New project" in project-flows.ts.
    await page.getByRole('link', { name: 'New task' }).first().click()
    const taskDialog = page.getByRole('dialog', { name: 'New task' })
    await taskDialog.getByRole('textbox', { name: 'Title' }).fill(taskTitle)
    await taskDialog.getByRole('button', { name: 'Create task' }).click()
    await expect(taskDialog).not.toBeVisible()

    // Create the label via the Manage labels dialog.
    await page.getByRole('link', { name: 'Manage labels' }).click()
    const labelsDialog = page.getByRole('dialog', { name: 'Manage labels' })
    await labelsDialog.getByRole('textbox', { name: 'New label name' }).fill(labelName)
    await labelsDialog.getByRole('button', { name: 'Create label' }).click()
    await expect(labelsDialog.getByText(labelName)).toBeVisible()
    await labelsDialog.getByRole('button', { name: 'Done' }).click()
    await expect(labelsDialog).not.toBeVisible()

    // Assign the label to the task from its drawer.
    await page.getByRole('link', { name: taskTitle }).click()
    const taskDrawer = page.getByRole('dialog', { name: taskTitle })
    await taskDrawer.getByRole('combobox', { name: 'Add a label' }).selectOption({ label: labelName })
    await expect(taskDrawer.getByText(labelName)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(taskDrawer).not.toBeVisible()

    // Filter the task list by that label.
    await page.getByRole('combobox', { name: 'Label' }).selectOption({ label: labelName })
    await expect(page.getByText(`Label: ${labelName}`)).toBeVisible()
    await expect(page.getByRole('link', { name: taskTitle })).toBeVisible()

    // Reload proves persistence through the real backend, not React/query-cache
    // state — both the label assignment and the ?label= filter in the URL.
    await page.reload()
    await expect(page.getByText(`Label: ${labelName}`)).toBeVisible()
    await expect(page.getByRole('link', { name: taskTitle })).toBeVisible()
  },
)
