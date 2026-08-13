import { Link } from 'react-router'

import styles from './NotFoundPage.module.css'

/* §2 line 51 — an unknown route and a 404 response share one presentation. This
   is that presentation; StateBlock reuses the same copy shape for in-page 404s. */
export function NotFoundPage() {
  return (
    <div className="content-column">
      <h1 className="type-page-title">Not found</h1>
      <p className={`${styles.body} type-body`}>
        That page doesn&apos;t exist. It may have been removed, or the address may be mistyped.
      </p>
      <Link to="/projects" className="type-interface">
        Back to projects
      </Link>
    </div>
  )
}
