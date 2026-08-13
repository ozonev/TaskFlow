import type { ReactNode } from 'react'

import styles from './Select.module.css'

export interface SelectOption {
  value: string
  label: string
}

/** §10 "Select — as text field" for every state. Always has a persistent visible label. */
export function Select({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
}): ReactNode {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={`${styles.label} type-label`}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${styles.control} type-interface`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
