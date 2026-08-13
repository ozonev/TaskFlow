import { usePrefersReducedMotion } from '../a11y/useReducedMotion'
import styles from './SkeletonBlocks.module.css'

const WIDTH_CLASSES = [styles.w1, styles.w2, styles.w3]

/**
 * The non-table counterpart to SkeletonRows: a list of placeholder bars for
 * panels that aren't tabular (comments, activity). SkeletonRows renders `<tr>`
 * elements, which are only valid inside a `<table>` — this is the same shimmer
 * treatment for everything else.
 */
export function SkeletonBlocks({ count }: { count: number }) {
  const reducedMotion = usePrefersReducedMotion()

  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className={styles.block}>
          <span
            className={`${styles.bar} ${WIDTH_CLASSES[index % WIDTH_CLASSES.length]}`}
            data-motion={reducedMotion ? 'static' : undefined}
          />
        </li>
      ))}
    </>
  )
}
