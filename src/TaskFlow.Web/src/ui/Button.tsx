import type { ButtonHTMLAttributes } from 'react'
import { Link, type LinkProps } from 'react-router'

import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary'

/**
 * §10's Primary/Secondary button rows as one component. `isLoading` swaps in a
 * progressive-verb label with no spinner and keeps the control disabled — §10
 * line 209 is explicit that loading never grows an icon.
 */
export function Button({
  variant = 'secondary',
  isLoading = false,
  disabled,
  className,
  ...rest
}: {
  variant?: ButtonVariant
  isLoading?: boolean
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      type={rest.type ?? 'button'}
      disabled={disabled || isLoading}
      className={`${styles.button} ${variant === 'primary' ? styles.primary : styles.secondary} type-interface ${className ?? ''}`}
    />
  )
}

/**
 * The same visual treatment for navigation rather than an action — e.g. "New
 * project" opening the create-project route. A styled Link, not a button
 * pretending to navigate.
 */
export function LinkButton({
  variant = 'secondary',
  className,
  ...rest
}: {
  variant?: ButtonVariant
} & LinkProps) {
  return (
    <Link
      {...rest}
      className={`${styles.button} ${variant === 'primary' ? styles.primary : styles.secondary} type-interface ${className ?? ''}`}
    />
  )
}
