/* Behavioural numbers the brief specifies. These are not styles, so they live here
   rather than in layout.css — and the tests import them, so a test can never
   quietly disagree with the implementation about what "debounced" means. */

/** §6 line 116 — search debounces before writing to the query string. */
export const SEARCH_DEBOUNCE_MS = 300

/** §7 line 150 — a response under this shows no loading state at all. */
export const LOADING_DELAY_MS = 200

/** §7 line 146 — character counters go live past 90% of the limit. */
export const COUNTER_THRESHOLD = 0.9

/** §7 lines 143, 145 — skeleton row count while loading a list. */
export const SKELETON_ROWS = 5

/** Default page size, matching the API's own default. */
export const DEFAULT_PAGE_SIZE = 20

/** §6 line 119 — author name persists between comments. */
export const AUTHOR_NAME_STORAGE_KEY = 'taskflow.commentAuthorName'
