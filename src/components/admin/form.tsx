import { useState } from 'react'
import type { ReactNode } from 'react'

export const NO_FORM_RESTORE = { autoComplete: 'off' }

export function AdminTextField({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  maxLength,
  hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  required?: boolean

  maxLength?: number
  hint?: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-bold text-(--bss-text)">
        {label}
        {maxLength !== undefined && (
          <span className="ml-2 text-xs font-normal text-(--bss-text-secondary)">
            ({maxLength - value.length} karakter hátra)
          </span>
        )}
      </span>
      <input
        type={type}
        value={value}
        required={required}
        maxLength={maxLength}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        className="h-10 border-b border-(--nav-border-b) bg-(--nav-search-bg) px-2 outline-none focus:border-(--orange)"
      />
      {hint !== undefined && (
        <span className="text-xs text-(--bss-text-secondary)">{hint}</span>
      )}
    </label>
  )
}

/** `HH:mm` from loosely typed input (`9:30`, `09.30`, `0930`, `19`); null when invalid. */
export function parseTimeOfDay(input: string): string | null {
  const match = /^(\d{1,2})(?:[:.\s]?(\d{2}))?$/.exec(input.trim())
  if (match === null) {
    return null
  }
  // The minutes group is optional, so it can be undefined despite the type.
  const [, hourText, minuteText = '0'] = match
  const hour = Number(hourText)
  const minute = Number(minuteText)
  if (hour > 23 || minute > 59) {
    return null
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function combineDateTime(date: string, time: string): string {
  const parsedTime = parseTimeOfDay(time)
  return date === '' || parsedTime === null ? '' : `${date}T${parsedTime}`
}

/**
 * Date + time field with a `datetime-local` style value (`YYYY-MM-DDTHH:mm`,
 * '' while incomplete). The time is typed rather than picked: the native time
 * spinner wraps around (59 → 00) without moving the hour, which is easy to get
 * wrong.
 */
export function AdminDateTimeField({
  label,
  value,
  onChange,
  required = false,
  hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  hint?: ReactNode
}) {
  const [date, setDate] = useState(value.slice(0, 10))
  const [time, setTime] = useState(value.slice(11, 16))
  const [emitted, setEmitted] = useState(value)
  // Follow changes from outside, e.g. the form being cleared after saving.
  if (value !== emitted) {
    setEmitted(value)
    setDate(value.slice(0, 10))
    setTime(value.slice(11, 16))
  }

  function update(nextDate: string, nextTime: string) {
    setDate(nextDate)
    setTime(nextTime)
    const next = combineDateTime(nextDate, nextTime)
    setEmitted(next)
    onChange(next)
  }

  const timeInvalid = time.trim() !== '' && parseTimeOfDay(time) === null
  const inputClass =
    'h-10 border-b border-(--nav-border-b) bg-(--nav-search-bg) px-2 outline-none focus:border-(--orange)'
  return (
    <fieldset className="flex flex-col gap-1 text-sm">
      <legend className="mb-1 font-bold text-(--bss-text)">{label}</legend>
      <div className="flex gap-2">
        <input
          type="date"
          aria-label={`${label} – dátum`}
          value={date}
          required={required}
          autoComplete="off"
          onChange={(event) => update(event.target.value, time)}
          className={`${inputClass} min-w-0 flex-1`}
        />
        <input
          type="text"
          inputMode="numeric"
          aria-label={`${label} – időpont (óó:pp)`}
          aria-invalid={timeInvalid}
          placeholder="óó:pp"
          value={time}
          required={required}
          maxLength={5}
          autoComplete="off"
          onChange={(event) => update(date, event.target.value)}
          onBlur={() => {
            const parsed = parseTimeOfDay(time)
            if (parsed !== null && parsed !== time) {
              update(date, parsed)
            }
          }}
          className={`${inputClass} w-20 text-center tabular-nums`}
        />
      </div>
      {timeInvalid && (
        <span role="alert" className="text-xs text-(--orange)">
          Az időpontot óó:pp formában add meg (pl. 19:30).
        </span>
      )}
      {hint !== undefined && (
        <span className="text-xs text-(--bss-text-secondary)">{hint}</span>
      )}
    </fieldset>
  )
}

export function AdminTextArea({
  label,
  value,
  onChange,
  rows = 4,
  maxLength,
  hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  rows?: number
  maxLength?: number
  hint?: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-bold text-(--bss-text)">
        {label}
        {maxLength !== undefined && (
          <span className="ml-2 text-xs font-normal text-(--bss-text-secondary)">
            ({maxLength - value.length} karakter hátra)
          </span>
        )}
      </span>
      <textarea
        value={value}
        rows={rows}
        maxLength={maxLength}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        className="border-b border-(--nav-border-b) bg-(--nav-search-bg) p-2 outline-none focus:border-(--orange)"
      />
      {hint !== undefined && (
        <span className="text-xs text-(--bss-text-secondary)">{hint}</span>
      )}
    </label>
  )
}

export function AdminPrimaryButton({
  children,
  onClick,
  disabled = false,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      {...NO_FORM_RESTORE}
      className="solid-btn rounded bg-(--orange) px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
    >
      {children}
    </button>
  )
}

export function AdminSecondaryButton({
  children,
  onClick,
  disabled = false,
  confirm,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean

  confirm?: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      {...NO_FORM_RESTORE}
      onClick={() => {
        if (confirm === undefined || window.confirm(confirm)) {
          onClick()
        }
      }}
      className="ctrl-btn rounded border border-(--nav-border-b) px-4 py-2 text-sm font-bold text-(--bss-text) hover:border-(--orange) disabled:opacity-40"
    >
      {children}
    </button>
  )
}
