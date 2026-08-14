import { Link } from 'react-router'

import type { ProjectResponse } from '../../api/types'
import { formatDate, formatDateTime } from '../../lib/datetime'
import { SkeletonRows } from '../../ui/SkeletonRows'
import styles from './ProjectTable.module.css'

const COLUMN_COUNT = 3

/**
 * §4 — the project list as a real table with a caption, not div soup (§8 line
 * 154). No sort control: §4 line 89 calls for one, but `GET /api/projects` has
 * no sort parameter and the API orders by createdAtUtc — sorting client-side
 * would only reorder the current page, which is wrong across pages and would
 * look convincingly real in a mock-only build. Recorded as a deferred capability,
 * not shipped as a control that lies.
 */
export function ProjectTable({
  projects,
  page,
  totalCount,
  totalPages,
  showLoading,
  skeletonRows,
}: {
  projects: ProjectResponse[]
  page: number
  totalCount: number
  totalPages: number
  showLoading: boolean
  skeletonRows: number
}) {
  return (
    <table className={styles.table} aria-busy={showLoading}>
      <caption className={`${styles.caption} type-meta`}>
        {totalCount} {totalCount === 1 ? 'project' : 'projects'}
        {totalPages > 1 && `, page ${page} of ${totalPages}`}
      </caption>
      <thead>
        <tr>
          <th className="type-label" scope="col">
            Name
          </th>
          <th className={`type-label ${styles.descriptionColumn}`} scope="col">
            Description
          </th>
          <th className="type-label" scope="col">
            Created
          </th>
        </tr>
      </thead>
      <tbody>
        {showLoading ? (
          <SkeletonRows rows={skeletonRows} columns={COLUMN_COUNT} />
        ) : (
          projects.map((project) => (
            <tr key={project.id} className={styles.row}>
              <td>
                <Link
                  to={`/projects/${project.id}`}
                  className={`${styles.nameLink} truncate type-interface`}
                  title={project.name}
                >
                  {project.name}
                </Link>
              </td>
              <td className={styles.descriptionColumn}>
                {project.description ? (
                  <span className={`${styles.description} clamp-2 type-body`} title={project.description}>
                    {project.description}
                  </span>
                ) : (
                  <span className={`${styles.noDescription} type-body`}>—</span>
                )}
              </td>
              <td>
                <time
                  dateTime={project.createdAtUtc}
                  title={formatDateTime(project.createdAtUtc)}
                  className="type-meta"
                >
                  {formatDate(project.createdAtUtc)}
                </time>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  )
}
