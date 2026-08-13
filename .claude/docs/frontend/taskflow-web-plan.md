# TaskFlow Web — mock-backed React prototype

## Context

`.claude/docs/frontend/taskflow-ui-brief.md` is an approved build brief that selects Direction B (grouped task list + detail drawer) over a status board, and specifies routes, data, components, states, tokens and behaviour in enough detail to build from. Nothing has been built against it — there is no frontend of any kind in the repo today.

The goal is a **prototype**, not a shipped client: it renders the approved flows against a typed in-memory mock so the interaction design, the UI state coverage and the accessibility contract can be reviewed before any of it is wired to the real API. Two constraints shape everything below:

- **Mock-only, deliberately.** The backend has no CORS policy and no SPA hosting (`src/TaskFlow.Api/Program.cs`), so browser calls from a dev server would be blocked regardless. More importantly the user's requirement is explicit: mock services return typed data, no component claims to persist data. So the mock is the product here, and the seam between it and any future HTTP client is the thing that has to be right.
- **The brief outranks invention.** Every screen, state and token below traces to a section of the brief. Where the brief is silent, the answer is "not in this build" (§11), not a judgement call.

Two upstream inputs were missing when planning started and are now resolved: the token values arrived as `.claude/docs/frontend/taskflow-tokens.css`, and three open questions (contrast conflicts, drawer scope, test depth) were decided by the user. Those decisions are recorded in **Decisions** below because they are the places where this plan knowingly departs from the brief's literal text.

## Decisions that depart from the brief

| # | Brief says | This build does | Why |
|---|---|---|---|
| 1 | §3 "Real — live calls" for projects, search, comments, audit | Everything goes through an in-memory mock client | User requirement; also no CORS/SPA hosting exists |
| 2 | §10 primary button = `--color-accent` fill, white text | Fill = `--color-accent-700`, hover `-800`, pressed `-900` | Base accent is 4.07:1 with white at §9's 14px Interface size — fails §8's 4.5:1 mandate. `-700` is 6.39:1 |
| 3 | §9 Metadata + Label roles = `--color-neutral-600` | `--color-neutral-700`; `-600` kept for hairlines and icons only | `-600` on `--color-bg` is 3.85:1 at 11–13px — fails. `-700` is 5.84:1 |
| 4 | §9 Danger role = `--color-accent-2` | `-2-700` for error/validation **ink**; base `-2` stays on rules, required marks, overdue dates | `-2` as body ink is 4.61:1 (passing but marginal); `-2-700` is 6.50:1 |
| 5 | §2 includes `/projects/:projectId/edit`; §3 includes project audit | Both omitted | Absent from the user's feature list; a second form and route with no demo value |
| 6 | §3 line 82 leaves the open-task-count column as "mocked or dropped" | **Dropped.** Project table is name / description / created | The list response can't carry it and §3 forbids per-row search calls. One fewer mocked surface to mislabel |

Decisions 2–4 introduce **no new values** — every colour still comes from the supplied token file, so §12's "no value not in §9" holds. Only the step assignment moves. This gets a comment at the top of the stylesheet that applies them, so it reads as a deliberate contrast fix rather than drift.

## Dependencies to approve

CLAUDE.md requires asking before adding packages. npm isn't literally covered but the same judgement applies, so: **runtime** `react`, `react-dom`, `react-router`. **Dev** `vite`, `@vitejs/plugin-react`, `typescript`, `@types/react`, `@types/react-dom`, `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `vitest-axe`, `axe-core`, `eslint` + `typescript-eslint` + `eslint-plugin-react-hooks` + `eslint-plugin-jsx-a11y`, `prettier`.

Deliberately **not** added: no TanStack Query (the ~120 lines of `useResource` below covers what §7/§11 need), no focus-trap library, no UI kit, no CSS framework, no date library, no icon package (inline SVG).

Node 22.14.0 / npm 10.9.2 are installed and satisfy Vite 7.

## File layout

Feature-first, because the brief's own component inventory (§4) is feature-shaped and the two features barely share state.

```
src/TaskFlow.Web/
  package.json  tsconfig.json  tsconfig.node.json  vite.config.ts
  index.html  README.md  eslint.config.js  .prettierrc
  src/
    main.tsx  App.tsx  routes.tsx
    styles/
      tokens.css        # verbatim copy of .claude/docs/frontend/taskflow-tokens.css — never hand-edited
      overrides.css     # decisions 2-4 + §9 per-role line-heights + skeleton reduced-motion
      layout.css        # §5/§6/§10 numeric constants as named custom properties
      type.css          # §9 typography roles as .type-* classes
      base.css          # reset, skip link, focus-visible, .visually-hidden
    api/
      types.ts          # wire types, Paged<T>, ProblemDetails, ValidationProblemDetails, ApiError
      client.ts         # TaskFlowClient interface — the port; the only thing components see
      mockStore.ts      # the ONLY fixture file; imported solely by mockClient.ts
      mockClient.ts     # in-memory TaskFlowClient over mockStore
      mockControl.ts    # latency + failure injection, read from ?mock= and a dev panel
      problemDetails.ts # case-insensitive field-error lookup
      ClientProvider.tsx
    hooks/
      useResource.ts  useDebouncedValue.ts  useFocusTrap.ts
      useOverlayCount.ts  useShortcuts.ts  useRovingFocus.ts
      useReducedMotion.ts  usePersistentValue.ts
    components/            # AppHeader PageHeader Pagination FormDialog ErrorSummary
                           # StateBlock Skeleton Toast Tag Field Button LiveRegion MockPanel
    features/
      projects/  ProjectsPage ProjectTable CreateProjectDialog
      tasks/     TaskListPage FilterBar ActiveFilterChips TaskGroup TaskRow
                 CreateTaskDialog TaskDrawer CommentList CommentForm ActivityFeed
                 grouping.ts
    test/  setup.ts  renderApp.tsx
```

## The mock layer

`client.ts` declares one interface mirroring the real endpoints exactly — same names, same parameters, same paging envelope, same error shapes — so replacing it later is one new file plus one line in `main.tsx`:

```ts
export interface TaskFlowClient {
  listProjects(q: {page?: number; pageSize?: number}): Promise<Paged<ProjectResponse>>
  createProject(body: {name: string; description?: string | null}): Promise<ProjectResponse>
  getProject(id: string): Promise<ProjectResponse>
  searchTasks(q: SearchTasksQuery): Promise<Paged<TaskResponse>>
  createTask(projectId: string, body: CreateTaskBody): Promise<TaskResponse>
  listComments(taskId: string): Promise<CommentResponse[]>
  createComment(taskId: string, body: {authorName: string; text: string}): Promise<CommentResponse>
  listTaskAudit(taskId: string): Promise<AuditLogResponse[]>
}
```

Fidelity details the mock must reproduce, because getting them wrong makes the prototype lie about the API:

- `title` filter is a **case-insensitive substring** match, not prefix or exact.
- `dueDateFrom`/`dueDateTo` are inclusive and **exclude tasks whose `dueDate` is null**.
- An unknown `projectId` in search returns an **empty page, not 404**.
- `totalPages === 0` when `totalCount === 0` — not 1.
- Validation failures reject with `ApiError(400, ValidationProblemDetails)` whose `errors` keys are **PascalCase** (`"Title"`, `"PageSize"`) or JSON paths (`"$.dueDate"`), never camelCase. `problemDetails.ts` looks them up case-insensitively, matching what the backend's own tests do.
- `status` is not accepted on create; new tasks are always `Todo`. The status filter select therefore has exactly one real option — the brief's §7 filter copy must not imply more.
- **`GET /api/tasks/{id}` does not exist.** Per §3 line 78 the drawer's cold deep-link path goes through `searchTasks({projectId})` and selects the id client-side, showing not-found if absent. The mock exposes no `getTask`, so the temporary shape is visible in the code and its eventual removal is a one-place change.

**Seed data** in `mockStore.ts` is shaped to make every UI state reachable without editing code: enough projects to force pagination past page 1, one project with zero tasks (§7's first empty state), one project whose tasks populate all five due-window groups including overdue and null-due-date, one task with no comments and no audit rows (the drawer's two empty panels), and one long title plus one long description to exercise §5 line 111's truncation and two-line clamp.

**Meeting the four mock requirements:**

| Requirement | Mechanism |
|---|---|
| Returns typed data | The interface above; no `any`, no casts at call sites |
| Components don't import fixtures | `mockStore.ts` is imported by `mockClient.ts` and its tests, nothing else. Components read the client from `ClientProvider` context. An ESLint `no-restricted-imports` rule fails the build if a component reaches for it |
| Success/failure easy to trigger | `?mock=fail:createProject`, `?mock=slow`, `?mock=empty`, `?mock=error:search` deep-link a state; a **Mock panel** in the header toggles the same switches live, so a demo can break a call mid-flow without a reload |
| No false persistence claim | Mutations *do* mutate the in-memory store, because §7 requires the list to refetch and show the new row. Honesty comes from saying exactly what that means: a persistent header banner — "Prototype · mock data, resets on reload" — plus the README. The claim made is true; nothing implies durability |

## State ownership

| State | Owner | Notes |
|---|---|---|
| `q`, `status`, `dueFrom`, `dueTo`, `page` | **URL search params** — single source of truth (§2, §6, §7) | |
| Search input text | Local state in `FilterBar`, debounced 300ms → `setSearchParams(…, {replace: true})` (§6 line 116) | **The one desync risk.** Back/forward changes `?q=` without the input knowing. Fixed by syncing URL→input on any URL change the input didn't originate, tracked with a ref. Called out because it is the easy bug here |
| Status / date filters | Direct `setSearchParams` **push**, so back removes a filter (§6 line 117) | |
| Drawer open / which task | Route param `:taskId` — no component state (§2) | |
| Group collapse | `useState` in `TaskListPage` — per session, deliberately not persisted (§6 line 121) | |
| Comment author name | `localStorage` via `usePersistentValue` (§6 line 119) | |
| Pending optimistic comments | `useState` in the comment panel, merged with fetched (§6 line 119) | |
| Toasts | `ToastProvider` context — must outlive the dialog that triggers them (§6 line 120) | |
| Open-overlay count | `useOverlayCount` context — drives `inert` and suppresses shortcuts; a counter so drawer + modal stack correctly | |
| Mock failure switches | `mockControl` module, seeded from the URL, subscribable | |

## Routing

React Router, nested so a modal/drawer route renders **over** its parent and cold entry renders the background for free:

```
/                                        → redirect to /projects
/projects                                → ProjectsPage (renders <Outlet/>)
  /projects/new                          → CreateProjectDialog
/projects/:projectId                     → TaskListPage (renders <Outlet/>)
  /projects/:projectId/tasks/new         → CreateTaskDialog
  /projects/:projectId/tasks/:taskId     → TaskDrawer
*                                        → NotFound (shared with 404 responses, §2)
```

Closing is not simply `navigate(-1)`: on a cold deep link there is no in-app entry to pop back to, and `-1` would leave the app — which §2 line 53 forbids. So close resolves as: if the overlay route was pushed from within this app (`location.key !== 'default'`), pop; otherwise `navigate(parentPath + search, {replace: true})`. Either way the parent's filters and scroll position survive (§6 line 118).

## Data fetching

Hand-rolled `useResource`, covering exactly what §7/§11 ask for and nothing more:

```ts
useResource<T>(key: string, fetch: (signal: AbortSignal) => Promise<T>,
               opts?: {refetchOnFocus?: boolean})
  → {data, error, isPending, showLoading, refetch}
```

- `showLoading` stays false for the first **200ms** so a fast response shows no loading state at all (§7 line 150) — the flash is the thing being avoided, so the timer is the feature.
- One `AbortController` per request plus a sequence counter, so fast filter typing can't land a stale response over a fresh one.
- `refetchOnFocus` implements §11 line 231's refetch-on-window-focus without a socket.
- Each drawer panel calls it independently, which is what gives §7 line 147 its per-panel loading and per-panel error retry for free.

## Due-window grouping

The brief asks for grouping "by due window" (§1 line 20, §4 line 93) computed client-side from one search response, but never enumerates the windows. Five groups, in `grouping.ts` as a pure function over `TaskResponse[]` so it is unit-testable without rendering:

| Group | Rule | Notes |
|---|---|---|
| Overdue | `dueDate < startOfToday` | Dates rendered in `--color-accent-2` per §9's overdue role |
| Today | within today | |
| This week | after today, through Sunday | Local zone |
| Later | after this week | |
| No due date | `dueDate === null` | **Must exist:** §3's `dueDateFrom`/`dueDateTo` filters exclude null `dueDate` entirely, so without its own group these tasks would read as a bug |

Windows are computed in the viewer's local zone from the UTC `dueDate`, consistent with §3 line 67's rendering rule. Empty groups are omitted; collapsed groups still render their heading and count (§4 line 93) so nothing is silently hidden.

## Accessibility mechanics

**Focus trap** — hand-rolled `useFocusTrap`, not native `<dialog>`: `showModal()` fights route-driven open state, and the §6 drawer slide plus §10's shadow tokens are simpler on a plain element. Contract per §8 line 155: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` on the title, focus to the close button on open, Tab/Shift+Tab cycling handled by our own keydown handler, focus returned to the trigger on close. The background gets a real `inert` attribute, not just a dim.

Two edge cases worth writing down: `inert` is unimplemented in jsdom, so the trap cannot *rely* on it — the keydown cycling is what actually contains focus, and `inert` is the belt-and-braces layer for pointers and AT. And the trigger element may have unmounted by the time the overlay closes (a row that a refetch removed), so restore falls back to the row for that task, then the page `<h1>` with `tabIndex={-1}`.

**Shortcuts** (§6 lines 127–135) — one document-level handler registered by `TaskListPage`, with three guards: skip when the event target is an input/textarea/select/contenteditable, skip when the overlay count is non-zero, skip when modifiers are held. `Ctrl/Cmd+Enter` is the exception and binds locally to the comment textarea.

`j`/`k` roving focus walks a **flat array of visible task ids** derived from the grouping result, so it crosses group boundaries (§6 line 130) and skips collapsed groups without special-casing either. Rows are `<tr>` with a managed `tabIndex`; `Enter` on the focused row opens the drawer, while the title inside stays a real `<Link>` — §8 line 158's "the row is not a link; the title is", with keyboard row activation layered on top.

**The planned label control** (§3 line 80) — dashed border, "Planned" chip, `aria-disabled="true"` but still focusable so its status is announced rather than silently skipped (§8 line 162). It issues no request and never enters the query string; both are asserted by test, since this is the acceptance criterion most likely to rot into a real-looking control.

## CSS

CSS Modules (zero-config in Vite) plus four global stylesheets. `tokens.css` is copied in verbatim and never hand-edited, so a future real Broadsheet file drops in cleanly.

`layout.css` declares as named custom properties the numbers the brief specifies in §5/§6/§10 but which are **not** in the token file, each commented with its source line — so they appear once rather than scattered as magic numbers: content max 1200px, drawer 470px/380px, durations 150ms/120ms, opacities 45%/60%, touch target 44px, debounce 300ms.

Three things need explicit handling:

1. **Breakpoints can't be custom properties.** CSS forbids `var()` inside `@media`, so 760px and 1100px appear as literals. They are confined to the few layout modules and each carries a `/* §5 line 107 */` comment. Stating this rather than pretending otherwise.
2. **The token file's reduced-motion rule is not sufficient.** It sets `animation-duration: 0.01ms !important` globally, which makes the skeleton shimmer *snap to its final keyframe* instead of becoming the static tint §6 line 123 requires. The skeleton needs its own `prefers-reduced-motion` rule setting a flat `--color-neutral-200` fill and `animation: none`.
3. **The token file's `h1–h6 { line-height: 1.12 }` contradicts §9's type table**, which wants 1.2 for Section title and Group heading. `type.css` defines `.type-*` classes per §9 role and overrides line-height where the global rule is wrong.

## UI quality, in your priority order

Where each of the five lands, so none is left implicit:

**1. Keyboard, focus, labels, contrast, reduced motion.** Keyboard and focus are the *Accessibility mechanics* section. Focus visibility comes from the token file's `:focus-visible` rule and is never removed. Contrast is Decisions 2–4, computed by hand and recorded. Reduced motion is the skeleton rule plus transition suppression. **Labels** get one shared `Field` component that is the only way a form control is rendered: it emits a persistent visible `<label htmlFor>` — never a placeholder standing in for one — and wires `aria-invalid` plus `aria-describedby` to the message element when rejected (§8 line 157). Making it the single path means a field *can't* ship unlabelled.

**2. Pending, success, validation, empty, failure feedback.** Pending: submit disabled with the label swapped to a progressive verb, no spinner (§10 line 209). Success: `Toast`, which per §10 line 102 is never the sole error channel. Validation: `ErrorSummary` at the dialog top that takes focus on rejection, plus per-field messages keyed case-insensitively off `ValidationProblemDetails.errors`. Empty: `StateBlock`, with the task list's two distinct variants. Failure: inline error block with retry and traceId, degrading per-panel in the drawer rather than replacing it.

**3. No avoidable loading or rendering work on the core journey.** One search call per view, per §1's table — grouping is derived client-side, not re-fetched. `useResource` aborts superseded requests so fast typing costs one render, not N. The 200ms threshold means a fast response renders no loading state at all. Grouping is memoized on the search result. Two things worth naming rather than hiding: the token file's `@import` of Source Serif 4 from Google Fonts is a **third-party network request on first paint** — it carries `display=swap` so text is never invisible, and self-hosting the two weights is the fix if that matters, but the supplied file is copied verbatim, so this is flagged not silently changed. And route-level code splitting is deliberately *not* used: the whole app is small enough that a second chunk on the core journey would cost more than it saves.

**4. Desktop and narrow screen.** §5's one breakpoint at 760px, plus the 1100px drawer-width step. Verified at three widths in a real browser, since jsdom does not lay out.

**5. Consistent typography, colour, spacing, icons, motion.** Type is the eight `.type-*` roles from §9 — components pick a role, never a size. Colour and spacing come only from token variables; an ESLint rule plus review keeps literals out of TSX. Motion is only the three things §6 line 122 permits. **Icons** are inline SVG from one `icons.tsx` module at a single stroke width, sized in `em` and inheriting `currentColor`, so they scale with their type role — no icon dependency, and no mixed-provenance icon set.

## Test plan

Vitest + RTL + user-event + vitest-axe. Each file maps to a §12 checklist row or one of the user's acceptance criteria.

| File | Asserts |
|---|---|
| `api/mockClient.test.ts` | Paging math incl. `totalPages===0` when empty; title substring case-insensitivity; date range excluding null `dueDate`; unknown `projectId` → empty page not 404; PascalCase validation keys; failure injection |
| `api/problemDetails.test.ts` | Field lookup matches `Title` / `title` / `$.dueDate` case-insensitively |
| `features/tasks/grouping.test.ts` | Due-window grouping as a pure function — overdue, today, this week, later, no due date |
| `projects/ProjectsPage.test.tsx` | Five skeleton rows + `aria-busy`; empty state with create action; error block with retry and traceId; pagination |
| `projects/CreateProjectDialog.test.tsx` | Empty and >100-char name rejected; submit disabled with "Creating…"; error summary takes focus; 201 closes + refetches + toasts; focus returns to trigger |
| `tasks/TaskListPage.test.tsx` | **The two distinct empty states** — no tasks in project vs no filter match stating the unfiltered count (§7 line 145); filters reach the URL; debounce replaces rather than pushes; result count in a polite live region |
| `tasks/FilterBar.test.tsx` | Planned label control is `aria-disabled`, focusable, issues **no** client call (spy), never enters the query string |
| `tasks/TaskDrawer.test.tsx` | Focus to close on open; Tab cycles within; Esc closes and restores focus; `inert` on background; panels load independently; per-panel error retry; task-404 → not-found |
| `tasks/CommentForm.test.tsx` | Optimistic append at pending opacity; failure keeps typed text with inline retry; Ctrl/Cmd+Enter posts; author name read from localStorage |
| `keyboard.test.tsx` | The §12 journey: `/` focuses search, `j`/`k` cross group boundaries and skip collapsed groups, Enter opens, `n` creates, shortcuts suppressed in inputs and while an overlay is open |
| `a11y.test.tsx` | vitest-axe clean on each screen, plus with a dialog and with the drawer open |
| `reducedMotion.test.tsx` | With `matchMedia` forced to reduce: no transition class on drawer/dialog, static skeleton class |

**What these tests cannot prove**, stated plainly rather than implied: jsdom does not implement `inert`, does not compute contrast, and does not lay out, so "background is genuinely inert", "focus ring is visible", and the §5 responsive rules are verified by driving the real app in a browser at both widths — not by this suite. The contrast figures in **Decisions** were computed by hand from the token values and are recorded there so they can be rechecked.

## Build order

Each step ends buildable, runnable, and with its own tests green — no big-bang integration.

1. **Scaffold + design system.** Vite/TS/Vitest config, the four global stylesheets, `.type-*` roles, skip link, `AppHeader`, prototype banner. Ends: app boots, axe clean.
2. **Mock layer + fetching.** `types.ts`, `client.ts`, `mockStore.ts`, `mockClient.ts`, `mockControl.ts`, `problemDetails.ts`, `useResource`, `ClientProvider`, Mock panel. Ends: the two API test files green, no feature UI yet.
3. **Project list.** `ProjectsPage`, `ProjectTable`, `Pagination`, `Skeleton`, `StateBlock` — all four states from §7. Ends: `ProjectsPage.test.tsx` green.
4. **New Project.** `FormDialog`, `Field`, `ErrorSummary`, `Toast`, `useFocusTrap`, `useOverlayCount`. Ends: full validation + focus contract green.
5. **Task list.** `FilterBar` incl. the planned control, `ActiveFilterChips`, `grouping.ts`, `TaskGroup`, `TaskRow`, URL sync, debounce, shortcuts, roving focus, both empty states. Ends: task-list, filter-bar and keyboard tests green.
6. **Drawer + Create Task.** `TaskDrawer`, `CommentList`, `CommentForm`, `ActivityFeed`, `CreateTaskDialog`, per-panel loading/errors, optimistic append, deep-link fallback. Ends: drawer and comment tests green.
7. **Quality pass.** Reduced motion, narrow-screen layout, axe sweep, README, `TECH_DEBT.md` entries, `.gitignore`.

## Repo housekeeping

- `.gitignore` — add `src/TaskFlow.Web/dist/`. `node_modules/` is already covered (line 302).
- **Do not** add the web project to `TaskFlow.slnx`; it is not an MSBuild project and `dotnet build` should stay unaffected.
- The `PostToolUse` format hook no-ops on non-`.cs` files (`format-edited-file.ps1:52`), so TS/TSX formatting is Prettier's job, not the hook's.
- **Delete `.claude/frontend/taskflow-ui-brief.md`** — a stray empty file I created earlier from a mistyped shell command, before the real brief's location was known. Not the brief.
- `TECH_DEBT.md` entries in the house format for: the missing `GET /api/tasks/{id}` and the temporary deep-link fallback that must be removed when it lands (§3 line 78); the mocked label filter standing until the capstone (§3 line 80); the absent CORS policy blocking any swap to live calls.

## Verification

1. `npm ci && npm run build` in `src/TaskFlow.Web` — clean TS build.
2. `npm test` — all suites green, including axe.
3. `npm run dev`, then drive the real app:
   - **Keyboard only, no mouse:** `/projects` → Tab to a project → open it → `/` to search → type → `j`/`k` across group boundaries → `Enter` to open the drawer → Tab to the comment box → type → `Ctrl+Enter` → `Esc` → confirm focus is back on the originating row. This is §12's acceptance test and the user's core-journey criterion.
   - **New Project:** submit empty (error summary takes focus), submit a 101-char name, then succeed — modal closes, list refetches, toast appears.
   - **Failure states:** `?mock=fail:createProject` and `?mock=error:search`, plus flipping the same switches from the Mock panel mid-flow.
   - **Both empty states:** a project with no tasks, then a filter matching nothing — confirm they read differently and the second states the unfiltered count.
   - **Planned label control:** focus it, confirm it announces as unavailable, and confirm the URL never gains a label param.
   - **Responsive:** 1400px, 900px and 600px — drawer becomes a full-screen sheet, filters collapse behind a count button, no horizontal scroll at any width.
   - **Reduced motion:** enable it in OS settings, confirm the drawer and dialog appear without transition and the skeleton is a static tint rather than a snapped shimmer.
4. `dotnet build` — confirm the backend is untouched.
