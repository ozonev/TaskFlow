import { NavLink } from 'react-router'

import { ShortcutHelp } from '../ui/ShortcutHelp'
import styles from './AppHeader.module.css'

/* §4 — brand, primary nav, and the skip-link target boundary.

   The prototype badge is the primary place the build tells the truth about its
   data (the others are the success-toast copy and the README). It is persistent
   and non-dismissible: mutations really do mutate the in-memory store, because
   §7 requires the list to refetch and show the new row, so what needs saying is
   not "nothing happened" but "this resets on reload". The long form is
   visually-hidden rather than a `title` attribute, which screen readers surface
   inconsistently on non-interactive elements. */
export function AppHeader() {
  return (
    <header className={styles.header}>
      <div className={`${styles.inner} content-column`}>
        <div className={styles.brandGroup}>
          <NavLink to="/projects" className={`${styles.brand} type-section-title`}>
            TaskFlow
          </NavLink>
          <span className={`${styles.badge} type-label`}>
            Prototype
            <span className="visually-hidden">
              . All data is held in memory. Reloading the page restores the sample data.
            </span>
          </span>
        </div>

        <nav aria-label="Primary">
          <NavLink
            to="/projects"
            className={({ isActive }) =>
              `${styles.navLink} type-interface ${isActive ? styles.navLinkActive : ''}`
            }
          >
            Projects
          </NavLink>
        </nav>

        <ShortcutHelp />
      </div>
    </header>
  )
}
