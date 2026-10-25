/**
 * Formatting helpers for native USDC (18 decimals on Arc).
 * Never use the ERC-20 USDC interface (6 decimals) for this app.
 */

const NATIVE_DECIMALS = 18
const MAX_DISPLAY_DECIMALS = 6

/** Format a raw 18-decimal bigint as a USDC string with at most 6 decimal places. */
export function formatNativeUsdc(raw: bigint | undefined, maxDecimals = MAX_DISPLAY_DECIMALS): string {
  if (raw === undefined) return '0'
  const divisor = 10n ** BigInt(NATIVE_DECIMALS)
  const whole = raw / divisor
  const fracRaw = raw % divisor
  if (fracRaw === 0n) return whole.toString()
  // Pad to 18 digits, then trim trailing zeros, then cap at maxDecimals.
  const fracStr = fracRaw.toString().padStart(NATIVE_DECIMALS, '0')
  const trimmed = fracStr.replace(/0+$/, '').slice(0, maxDecimals)
  return trimmed.length > 0 ? `${whole}.${trimmed}` : whole.toString()
}

/**
 * Parse a decimal string (e.g. "1.5") to a raw 18-decimal bigint.
 * Rejects strings with more than 6 decimal places.
 * Returns null on invalid input.
 */
export function parseNativeUsdc(str: string): bigint | null {
  const cleaned = str.trim()
  if (!cleaned || !/^\d*\.?\d*$/.test(cleaned)) return null
  const [wholePart = '0', fracPart = ''] = cleaned.split('.')
  // Reject more than 6 decimal places
  if (fracPart.length > MAX_DISPLAY_DECIMALS) return null
  const frac = fracPart.slice(0, NATIVE_DECIMALS).padEnd(NATIVE_DECIMALS, '0')
  try {
    return BigInt(wholePart) * 10n ** BigInt(NATIVE_DECIMALS) + BigInt(frac)
  } catch {
    return null
  }
}

/** Short address: 0x1234...abcd */
export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

/**
 * Format a bps guarantee as a percent string.
 * Uses bigint floor division to never overstate what backers are promised.
 * 11500n -> "115%"
 */
export function formatGuaranteeBps(bps: bigint): string {
  return `${(bps / 100n).toString()}%`
}

/**
 * Progress percent (floors, 0-100).
 * Returns 100 only when pledged >= goal.
 */
export function progressPct(pledged: bigint, goal: bigint): number {
  if (goal === 0n) return 0
  if (pledged >= goal) return 100
  // floor: multiply first to preserve precision, then divide
  return Number((pledged * 10000n) / goal) / 100
}

/** Countdown string from a unix-seconds deadline. */
export function formatCountdown(deadlineSecs: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = deadlineSecs - now
  if (diff <= 0) return 'ended'
  const d = Math.floor(diff / 86400)
  const h = Math.floor((diff % 86400) / 3600)
  const m = Math.floor((diff % 3600) / 60)
  if (d > 0) return `${d}d ${h}h left`
  if (h > 0) return `${h}h ${m}m left`
  return `${m}m left`
}

/**
 * Minimum deadline datetime-local string for the <input type="datetime-local"> min attribute.
 * Uses UTC to match what the contract uses (unix timestamps are UTC).
 */
export function getMinDeadlineStr(): string {
  const d = new Date(Date.now() + (10 * 60 + 60) * 1000) // +10 min + 1 min buffer
  // datetime-local expects "YYYY-MM-DDTHH:MM" in local time,
  // but we want the displayed value to correspond to UTC unix time.
  // We compute the UTC instant and format it as a local-time string that
  // represents the same moment in the browser's timezone.
  return d.toISOString().slice(0, 16)
}

/** Validate a link: allow http:// or https:// URLs; empty string is fine (optional). */
export function isSafeLink(link: string): boolean {
  return link === '' || link.startsWith('https://') || link.startsWith('http://')
}

/**
 * Return a user-readable message for a wallet error.
 * Detects user rejection by error name and by cause.
 */
export function formatWriteError(error: unknown): string {
  if (!error) return 'Transaction failed.'
  const e = error as { name?: string; message?: string; cause?: { name?: string } }
  const isRejection =
    e.name === 'UserRejectedRequestError' ||
    e.cause?.name === 'UserRejectedRequestError' ||
    e.message?.toLowerCase().includes('user rejected') ||
    e.message?.toLowerCase().includes('rejected the request')
  if (isRejection) return 'You cancelled in your wallet.'
  // Try to surface a custom Solidity error name from the message
  const match = e.message?.match(/\b([A-Z][a-zA-Z]+Error|[A-Z][a-zA-Z]+)\(\)/)
  if (match) return `Transaction reverted: ${match[1]}.`
  return e.message?.slice(0, 160) ?? 'Transaction failed.'
}
