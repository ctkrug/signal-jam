/** Formats a Date as its UTC calendar date, e.g. "2026-07-15". */
export function getUtcDateString(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Milliseconds remaining until the next UTC calendar day begins. */
export function msUntilNextUtcDay(now: Date = new Date()): number {
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return startOfToday + MS_PER_DAY - now.getTime();
}

/** Formats a millisecond duration as a "HH:MM:SS" countdown, clamped at zero. */
export function formatCountdown(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.round(msRemaining / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
