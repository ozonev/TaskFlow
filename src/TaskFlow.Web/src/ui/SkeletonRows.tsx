import { usePrefersReducedMotion } from '../a11y/useReducedMotion'
import styles from './SkeletonRows.module.css'

const WIDTH_CLASSES = [styles.w1, styles.w2, styles.w3, styles.w4]

/**
 * Placeholder table rows matching the real row rhythm (§7: "Loading uses
 * skeletons matching the real row rhythm, never a centred spinner").
 *
 * `data-motion="static"` is the half of the reduced-motion fix a CSS media query
 * cannot provide on its own: components can't see @media state, so a shimmer
 * that should go flat under prefers-reduced-motion needs this attribute to do it,
 * while the CSS rule in SkeletonRows.module.css covers the case where JS hasn't
 * hydrated yet.
 */
export function SkeletonRows({ rows, columns }: { rows: number; columns: number }) {
  const reducedMotion = usePrefersReducedMotion()

  return (
    <>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <tr key={rowIndex} className={styles.row}>
          {Array.from({ length: columns }, (_, columnIndex) => (
            <td key={columnIndex}>
              {/* Varying widths read as placeholder text rather than a row of
                  identical rectangles. */}
              <span
                className={`${styles.bar} ${WIDTH_CLASSES[(rowIndex + columnIndex) % WIDTH_CLASSES.length]}`}
                data-motion={reducedMotion ? 'static' : undefined}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
