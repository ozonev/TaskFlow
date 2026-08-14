# TaskFlow web UI: selected direction and implementation brief

**TaskFlow · build brief · v1 · 13 August 2026**

This brief is the single source for building the TaskFlow web client. It records the three directions considered, the one selected and why, and everything needed to implement it — routes, data, components, states, tokens and behaviour — without referring back to the design conversation or the wireframe file.

> **Backend as it stands.** The API exposes projects (list, create, get, patch, audit), task create and task search, comments (list, create) and task audit. `TaskItemStatus` has one member, `Todo`. There is no single-task GET, no task update or delete, no label entity, and no user or auth model — comments carry a typed author name. Every decision below is measured against that.

## 1. Directions compared

### A — Status board

Columns per status, cards dragged between them. Reads as the category default and demonstrates workflow at a glance.

**Rejected.** It needs three capabilities that do not exist: more than one status, a status-transition endpoint, and an ordering field. Drag-and-drop is also the weakest interaction to make keyboard-operable, which conflicts with the top priority. A board with one column is a worse list.

### B — Grouped list with a detail drawer *(selected)*

One scrollable task list grouped by due window, filters above it, and a task opening in a right-hand drawer over the list.

**Selected.** Every element maps to a call the API already answers; grouping is computed client-side from a single search response. Triage stays on one screen — filter, scan, open, comment, close — which is exactly the demo path. The drawer is a standard dialog pattern with a well-understood focus contract, and it degrades to a full-screen sheet on narrow viewports without changing its semantics.

### C — Two-pane inbox

A permanent list on the left, task detail always filled on the right, mail-client style.

**Rejected.** Stronger for high-volume triage, but it forces a task selection on load (an extra request before anything is useful), gives the list roughly half the width at desktop, and needs a genuinely different layout below 1100px rather than a graceful collapse. More build, more states, no gain on the priorities that rank highest.

### Decision against the priority order

| Priority | A — board | B — grouped list + drawer | C — two-pane |
| --- | --- | --- | --- |
| Accessibility | Drag-and-drop needs a parallel keyboard mechanism | List plus dialog; both patterns have settled semantics | Two live regions competing for focus after selection |
| Interaction clarity | Columns imply transitions that cannot happen | Filters, groups and counts state exactly what is shown | Clear, but selection state must survive filtering |
| Performance | All statuses fetched regardless of view | One search call per view; sub-panels load after | Two calls before first meaningful paint |
| Responsive | Columns do not survive narrow widths | Drawer becomes a sheet; list stacks | Needs a separate narrow layout |
| Visual and motion | Highest surface polish | Sufficient; restrained | Sufficient |

Direction B wins on the first four and loses only on the last, which ranks lowest. Visual polish is not permitted to compensate: a build that ships beautiful cards but an untrapped drawer fails this brief.

## 2. Pages and routes

| Route | Screen | Notes |
| --- | --- | --- |
| `/projects` | Project list | Landing route. `?page=` reflects pagination. |
| `/projects/new` | Create-project dialog over the list | Modal route; direct entry renders the list behind it. |
| `/projects/:projectId` | Grouped task list | Filters live in the query string: `?q=&status=&dueFrom=&dueTo=&page=`. |
| `/projects/:projectId/edit` | Edit-project dialog | PATCH; same form as create. |
| `/projects/:projectId/tasks/new` | Create-task modal | Modal route over the task list; filters preserved. |
| `/projects/:projectId/tasks/:taskId` | Task detail drawer | Drawer over the task list. Cold entry needs the single-task GET (§3). |
| `*` | Not found | Unknown route and 404 responses share one presentation. |

Every filter, page and open task is addressable. Back closes a dialog or undoes a filter; it never leaves the app unexpectedly.

## 3. Data required per screen

| Screen | Calls | Fields used |
| --- | --- | --- |
| Project list | `GET /api/projects?page&pageSize` | items[id, name, description, createdAtUtc], page, pageSize, totalCount, totalPages |
| Create project | `POST /api/projects` | name (required, ≤100), description (≤500) → 201 ProjectResponse |
| Task list | `GET /api/projects/{id}`, `GET /api/tasks/search?projectId&status&title&dueDateFrom&dueDateTo&page&pageSize` | project[name, description]; items[id, title, status, dueDate, createdAtUtc], paging block |
| Create task | `POST /api/projects/{id}/tasks` | title (required, ≤200), description (≤2000), dueDate (nullable, UTC) → 201 TaskResponse |
| Task drawer | `GET /api/tasks/{id}` *(new)*, `GET /api/tasks/{id}/comments`, `GET /api/tasks/{id}/audit` | task[title, description, status, dueDate, createdAtUtc]; comments[authorName, text, createdAtUtc]; audit[eventType, description, createdAtUtc] |
| Post comment | `POST /api/tasks/{id}/comments` | authorName (required, ≤100), text (required, ≤2000) → 201 CommentResponse |
| Project activity | `GET /api/projects/{id}/audit` | audit[eventType, description, createdAtUtc] |

All timestamps arrive UTC and are rendered in the viewer's local zone with the absolute value in a title attribute. Dates sent up are ISO-8601 UTC; the API treats an unspecified kind as already UTC.

### Real versus mocked

| Behaviour | Status | Handling in the build |
| --- | --- | --- |
| Projects: list, create, edit, paginate | Real | Live calls. |
| Task search and its filters | Real | Live call; query string is the source of truth. |
| Task create | Real | Live call; list refetches on 201. |
| Comments: read and post | Real | Live calls, optimistic append. |
| Audit feeds | Real | Live, read-only. |
| Open task by URL | Blocked | Until `GET /api/tasks/{id}` exists, a cold deep link falls back to fetching the project's search results and selecting the id; if absent, show not-found. This fallback is temporary and must be removed when the endpoint lands. |
| Status change, task edit, task delete | Out of scope | Not drawn, not stubbed. See §11. |
| Label filter | **Mocked until the capstone** | Rendered dashed, disabled, with a "Planned" chip and `aria-disabled="true"`; it never issues a request and never enters the query string. It exists so the eventual control's position and shape are agreed. |
| Open-task count per project | Mocked or dropped | The list response does not carry it. Either the API adds it or the column is removed before ship — no per-row search calls. |

## 4. Component inventory

| Component | Composed from | Responsibility |
| --- | --- | --- |
| AppHeader | `.nav`, `.nav-brand` | Brand, primary nav, skip-link target boundary. |
| PageHeader | headings, `.btn-primary` | Title, result count, primary action. |
| ProjectTable | `.table` | Sortable-by-name list with caption and paging. |
| Pagination | `.btn-secondary` | Previous/next plus position text; nav landmark. |
| FilterBar | `.field`, `.input`, `.seg` | Search, status select, due-date range, disabled label control. |
| ActiveFilterChips | `.tag-accent` | Removable summary of applied filters plus clear-all. |
| TaskGroup | heading + rows | Collapsible due-window group with a count. |
| TaskRow | `.table` row, `.tag` | Title, status tag, due date; opens the drawer. |
| TaskDrawer | `.dialog` semantics, `.elev-lg` | Task header, description, comments and activity tabs. |
| CommentList / CommentForm | `.field`, `.input`, `.btn-primary` | Read comments; post with optimistic append. |
| ActivityFeed | list | Read-only audit entries. |
| FormDialog | `.dialog-backdrop`, `.dialog` | Shared shell for create project, edit project, create task. |
| ErrorSummary | `.card` tinted accent-2 | Server and client validation, focus target on rejection. |
| StateBlock | heading + body + action | One component rendering empty, not-found and error states. |
| Skeleton | tinted blocks | Loading placeholder matching the real row rhythm. |
| Toast | `.card`, `.elev-md` | Success confirmations only; never the sole error channel. |

## 5. Layout and responsive rules

- Desktop-first. Content column maxes at 1200px, flush left with whitespace to the right; no centred hero measures.
- One breakpoint at 760px. Above it, the desktop layout as drawn; below it, the narrow layout.
- Drawer is 470px at ≥1100px, 40% of viewport between 760px and 1100px (minimum 380px), and full-screen below 760px.
- Below 760px: filters collapse behind one button carrying the active-filter count; the task table becomes stacked rows keeping title, status and due date; the project table drops the description column.
- Touch targets are at least 44px high below 760px; desktop density stays as drawn.
- No horizontal scrolling at any width. Long titles truncate with a tooltip carrying the full text; descriptions clamp to two lines.
- Sections are separated by whitespace, not rules or cards. The one boxed component is the dialog.

## 6. Interactions

- **Search** debounces 300ms, writes to `?q=`, and replaces rather than pushes history while typing so back does not step through keystrokes.
- **Filters** apply immediately on change and push a history entry, so back removes a filter.
- **Opening a task** pushes a route; closing pops it. The list keeps its scroll position and filters.
- **Posting a comment** appends optimistically at 60% opacity; on 201 it settles, on failure it stays with an inline retry and the typed text intact. Author name persists in local storage between comments.
- **Creating a task** closes the modal on 201, refetches the list, and shows a toast with a link to the new task. On 400 the modal stays open with per-field messages.
- **Group headers** collapse and expand; state is per session, not persisted.
- **Motion** is limited to a 150ms drawer slide, a 120ms dialog fade and the skeleton shimmer. Nothing else animates.
- **Reduced motion:** under `prefers-reduced-motion: reduce` the drawer and dialog appear without transition, the skeleton shimmer becomes a static tint, and optimistic-state changes are conveyed by opacity alone with no cross-fade.

### Keyboard

| Key | Context | Behaviour |
| --- | --- | --- |
| `/` | Task list | Focus the search field. |
| `j` / `k` | Task list | Move focus between rows, crossing group boundaries. |
| `Enter` | Focused row | Open the drawer. |
| `Esc` | Drawer or dialog | Close and return focus to the trigger. |
| `n` | Task list | Open create task. |
| `Tab` | Drawer or dialog | Cycles within it only; the background is `inert`. |
| `Cmd/Ctrl + Enter` | Comment box | Post the comment. |

Single-letter shortcuts are suppressed while a text input has focus. A shortcut list is reachable from the header and printed in the empty state of the task list.

## 7. UI states by screen

| Screen | Loading | Empty | Error | Other |
| --- | --- | --- | --- | --- |
| Project list | Five skeleton rows, `aria-busy` on the region | "No projects yet" with the create action | Inline error block with retry and traceId | Paging keeps skeletons at the last known page size |
| Create project | Submit disabled, label "Creating…" | — | Error summary plus per-field messages | 409/500 keeps the form filled |
| Task list | Skeleton group with five rows | Two distinct states: no tasks in project (create action) versus no match for filters (clear-filters action, stating the unfiltered count) | Inline error block; filters stay applied so retry reproduces the view | Result count in a polite live region |
| Create task | Submit disabled, "Creating…" | — | 400 renders `ValidationProblemDetails` per field, keyed by property name | Character counters go live past 90% of the limit |
| Task drawer | Header skeleton first; comments and activity load independently | "No comments yet" above the form; "No activity recorded" | Sub-panel failure degrades that panel only, with its own retry | 404 on the task replaces the drawer with not-found and offers a return to the list |
| Any route | — | — | 404: "That project is gone" showing the id; 500: title and traceId from problem+json, never the raw detail | Errors are announced in an assertive live region |

Loading uses skeletons matching the real row rhythm, never a centred spinner. A response under 200ms shows no loading state at all, to avoid a flash.

## 8. Accessibility expectations

- Lists are real tables with a caption stating the row count and current page. The row is not a link; the title is.
- The drawer and every dialog are `role="dialog"` with `aria-modal="true"` and a labelled title. Focus moves to the close button on open, is trapped while open, and returns to the trigger on close. The background is `inert`, not merely dimmed.
- Result counts and filter changes sit in a polite live region; errors in an assertive one.
- Every field has a persistent visible label — never a placeholder acting as one — with `aria-invalid` and `aria-describedby` wired to its message when rejected.
- Focus is visible everywhere: `2px solid var(--color-accent)` at `2px` offset, never removed, never browser default.
- Status is never carried by colour alone; the tag carries its text.
- Body text meets 4.5:1 against its background. The accent at paragraph size is only used at step 700 or darker; the base accent is reserved for chrome, icons and large text.
- A skip link precedes the header and targets the main region.
- Disabled planned controls use `aria-disabled` and stay focusable, so their "Planned" status is announced rather than skipped silently.
- The whole demo path — projects, filter, open a task, post a comment — is completable with the keyboard alone, and that is the acceptance test.

## 9. Tokens

All values come from the Broadsheet stylesheet. Semantic roles below map to those variables; no new hex values are introduced.

| Semantic role | Token | Applied to |
| --- | --- | --- |
| Page ground | `--color-bg` | App background |
| Raised surface | `--color-surface` | Dialogs, drawer, cards |
| Body ink | `--color-text` | All body and heading text |
| Muted ink | `--color-neutral-700` | Secondary text, notes |
| Faint ink | `--color-neutral-600` | Metadata, column headers |
| Hairline | `--color-neutral-200` / `-300` | Row rules, field borders |
| Interactive | `--color-accent` | Primary button fill, focus ring, active tab |
| Interactive hover | `--color-accent-600` | Hover fill |
| Interactive pressed | `--color-accent-700` | Pressed fill, accent text at body size |
| Selected tint | `--color-accent-100` | Status tag, filter chips, selected row |
| Danger / attention | `--color-accent-2` | Error rules, required marks, overdue dates |
| Danger tint / ink | `--color-accent-2-100` / `-900` | Error block background and its text |
| Elevation | `--shadow-sm` / `-md` / `-lg` | Toast, popover, drawer and dialog respectively |
| Radius | `--radius-md` (controls), `--radius-lg` (dialogs) | All corners |

Spacing uses the scale only: `--space-1` 5px for label-to-field, `--space-2` 10px inside controls, `--space-3` 15px between fields, `--space-4` 20px for dialog padding and row rhythm, `--space-6` 30px between blocks, `--space-8` 40px between page sections. Do not tighten the scale.

### Typography roles

| Role | Size / weight | Line height | Used for |
| --- | --- | --- | --- |
| Page title | 30px / 600 | 1.12 | Screen h1 |
| Section title | 20px / 600 | 1.2 | Dialog titles, drawer task title |
| Group heading | 16px / 600 | 1.2 | Due-window group headers |
| Body | 15px / 400 | 1.55 | Descriptions, comments, empty-state copy |
| Interface | 14px / 400 | 1.4 | Rows, buttons, fields |
| Meta | 12–13px / 400 | 1.45 | Dates, counts, helper text |
| Label | 11px / 600, .1em tracking, uppercase | 1.3 | Column headers, section kickers |
| Emphasis | Serif italic, body size | 1.55 | Quoted text; never a synthesized oblique |

Source Serif 4 throughout, headings and interface alike. No sans-serif is introduced for chrome. Monospace appears only for identifiers such as a traceId.

## 10. Component states

Every interactive component implements all seven. A state not listed for a component does not apply to it.

| Component | Default | Hover | Focus | Disabled | Loading | Error |
| --- | --- | --- | --- | --- | --- | --- |
| Primary button | accent fill, white text | accent-600 fill | 2px accent ring, 2px offset | 45% opacity, no pointer events | label swaps to progressive verb, spinner-free, stays disabled | never shows error itself; the form does |
| Secondary button | hairline border, ink text | accent-100 tint | same ring | 45% opacity | same as primary | — |
| Text field | hairline border, surface fill | neutral-400 border | accent border + ring, accent caret | 45% opacity, neutral-100 fill | read-only with skeleton value | accent-2 border, message below, `aria-invalid` |
| Select | as text field | as text field | as text field | 45% opacity | — | as text field |
| Filter chip | accent-100 tint | accent-200 tint | ring around the chip, remove button separately focusable | — | — | — |
| Planned control | dashed border, "Planned" chip | no change | focusable, ring shown | `aria-disabled`, announced as unavailable | — | — |
| Task row | hairline underline | neutral-100 fill | ring inset, title underlined | — | skeleton row | — |
| Drawer | surface, shadow-lg | — | trapped; close button focused on open | — | header skeleton, panels load independently | panel-level error block with retry |
| Dialog | surface, shadow-lg, backdrop | — | trapped; first field focused | — | submit disabled | error summary at top, focus moved to it |
| Comment | ink on surface | — | — | — | 60% opacity while pending | stays visible with inline retry |
| Tag | accent-100 / accent-800 text | — | — | — | — | overdue variant uses accent-2 ink |

## 11. Explicitly out of scope

- A status board, drag-and-drop, and any column ordering. Revisit when the status enum grows and a transition endpoint exists.
- Task editing, deletion and archiving. No endpoints, and no stub UI that implies them.
- Labels beyond the mocked filter control: no label creation, assignment, colour or management. The mock stands until the capstone.
- Assignees, avatars, mentions and notifications — there is no user model.
- Comment editing, deletion, threading and reactions.
- Bulk selection and bulk actions. The row checkbox in the wireframe is a placeholder for this and must not ship without the actions behind it.
- Saved views, cross-project search, dashboards and reporting.
- Attachments, rich text and markdown in descriptions or comments — plain text only, matching the API.
- Real-time updates. The list refetches on mutation and on window focus; no sockets.
- Dark mode. The system defines one ground.

## 12. Acceptance checklist

- Three directions compared and one selected on the stated priority order, with the losing cases recorded (§1).
- New Project is part of the approved flow: list action, modal route, validation, and a refetch on success (§2, §3, §7).
- Labels appear only as a disabled, clearly marked planned control and issue no requests (§3).
- Every screen has loading, empty and error behaviour, with two distinct empty states for the task list (§7).
- The keyboard-only demo path completes: projects, filter, open a task, post a comment, close, return focus (§6, §8).
- No colour, size, spacing or type value appears in the implementation that is not in §9.
- Only one new backend capability is assumed: `GET /api/tasks/{id}`. Anything else blocked is listed in §11 rather than invented.
