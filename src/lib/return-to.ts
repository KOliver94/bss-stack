export function sanitizeReturnTo(raw: string | null): string {
  if (
    !raw ||
    !raw.startsWith('/') ||
    raw.startsWith('//') ||
    raw.includes('\\')
  ) {
    return '/'
  }
  if (raw.length > 2048) {
    return '/'
  }
  return raw
}
