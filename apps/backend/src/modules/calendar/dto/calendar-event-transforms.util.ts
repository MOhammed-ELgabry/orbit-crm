/**
 * Normalizes a nullable free-text field: trims a string, and treats an
 * empty (or whitespace-only) string the same as omitting the field —
 * neither becomes a stored empty string. Passes null/undefined through
 * unchanged so @IsOptional() (which skips validation for both null and
 * undefined) can do the rest.
 *
 * Deliberately NOT the `value?.trim()` shorthand Task's own
 * description field uses — that shorthand turns an explicit null into
 * undefined before validation ever runs. That is harmless on a create
 * DTO (nothing to clear yet) but would silently break clearing on
 * update, which description/location on CalendarEvent explicitly need
 * to support.
 */
export function trimToNull({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Same relation-ID transform Task/Deal already use: trims a string,
 * passes anything else (including null/undefined) through unchanged.
 * An empty string survives this unchanged and is rejected by
 * @IsNotEmpty() on the field itself — a blank ID is never silently
 * treated as "no relation" the way an empty description is treated as
 * "no description" by trimToNull above. Relation-clearing must be an
 * explicit null, never an empty string.
 */
export function trimId({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}
