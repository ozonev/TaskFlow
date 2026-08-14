import { Outlet } from 'react-router'

import { useOverlayStack } from '../a11y/OverlayStack'
import { ToastProvider } from '../ui/ToastProvider'
import { AppHeader } from './AppHeader'
import { DevPanel } from './DevPanel'
import styles from './RootLayout.module.css'

/* Three sibling hosts under the router outlet, kept separate so that opening an
   overlay can mark the shell and the status host `inert` (§8 line 155) without
   also disabling the dialog itself. #status-host holds the toast, which contains
   a link — so it must go inert alongside the shell, not stay reachable.

   The skip link lives INSIDE #app-shell rather than as a page-level sibling: it
   must go inert along with the rest of the page while a dialog is open, or Tab
   could still reach a link whose target (#main) currently shows only the inert
   background of an open dialog.

   ToastProvider lives HERE rather than in AppProviders (which wraps
   RouterProvider from the outside): the toast can carry a `<Link>` (§6 line 120),
   and RootLayout is rendered BY the router, so it's the shallowest point that
   actually has Router context to give that Link. */
export function RootLayout() {
  const overlay = useOverlayStack()
  const dialogOpen = overlay.count > 0

  return (
    <ToastProvider>
      <div id="app-shell" className={styles.shell} inert={dialogOpen ? true : undefined}>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <AppHeader />
        <main id="main" tabIndex={-1} className={styles.main}>
          <Outlet />
        </main>
        <div className={`${styles.devPanel} content-column`}>
          <DevPanel />
        </div>
      </div>

      <div id="overlay-host" />
      {/* Toasts render here and can carry a link (§6 line 120's link to the new
          task) — aria-hidden alone would still leave that link reachable by Tab
          once the trap lets focus reach the natural end of the dialog's own tab
          order, since #status-host follows #overlay-host in DOM order. inert is
          what actually removes it from the tab sequence. */}
      <div id="status-host" inert={dialogOpen ? true : undefined} />
    </ToastProvider>
  )
}
