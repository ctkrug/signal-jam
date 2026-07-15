/**
 * Daily result persistence: reloading the page on the same UTC day shows
 * the completed result instead of a fresh puzzle, and a streak counter
 * tracks consecutive daily wins. Everything is stored client-side under
 * one localStorage key — there's no backend (see docs/VISION.md).
 */

const RESULTS_KEY = "signal-jam:results";

export type SweepOutcome = "decoy" | "lock";

export interface DailyResult {
  won: boolean;
  sweepsUsed: number;
  sweepBudget: number;
  outcomes: SweepOutcome[];
  streak: number;
}

type ResultsByDate = Record<string, DailyResult>;

/** Guards against a hand-edited or stale-schema entry reaching the app. */
function isDailyResult(value: unknown): value is DailyResult {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.won === "boolean" &&
    typeof r.sweepsUsed === "number" &&
    typeof r.sweepBudget === "number" &&
    typeof r.streak === "number" &&
    Array.isArray(r.outcomes) &&
    r.outcomes.every((o) => o === "decoy" || o === "lock")
  );
}

function readResults(): ResultsByDate {
  try {
    const raw = localStorage.getItem(RESULTS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const results: ResultsByDate = {};
    for (const [date, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isDailyResult(value)) results[date] = value;
    }
    return results;
  } catch {
    // Malformed JSON or storage unavailable — treat as no history.
    return {};
  }
}

function writeResults(results: ResultsByDate): void {
  try {
    localStorage.setItem(RESULTS_KEY, JSON.stringify(results));
  } catch {
    // Persistence is best-effort (private browsing, quota) — not required
    // for the current session to function.
  }
}

/** The stored result for `date`, or `null` if that puzzle wasn't completed. */
export function loadResult(date: string): DailyResult | null {
  return readResults()[date] ?? null;
}

/** Persists `result` as the completed outcome for `date`. */
export function saveResult(date: string, result: DailyResult): void {
  const results = readResults();
  results[date] = result;
  writeResults(results);
}

/** The UTC calendar date immediately before `date` (a "YYYY-MM-DD" string). */
export function previousUtcDateString(date: string): string {
  const ms = Date.parse(`${date}T00:00:00Z`);
  const prev = new Date(ms - 24 * 60 * 60 * 1000);
  const year = prev.getUTCFullYear();
  const month = String(prev.getUTCMonth() + 1).padStart(2, "0");
  const day = String(prev.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * The streak value for a puzzle completed today, given yesterday's
 * stored result (or `null` if yesterday wasn't played). A win extends
 * yesterday's streak only when yesterday was also a win; any gap, any
 * loss, or the very first play restarts the count at 1.
 */
export function nextStreak(yesterday: DailyResult | null, wonToday: boolean): number {
  if (wonToday && yesterday?.won) {
    return yesterday.streak + 1;
  }
  return 1;
}

/**
 * The streak to display right now: today's result if the puzzle is
 * already complete, otherwise the streak carried in from a won
 * yesterday (0 if yesterday wasn't played or was a loss).
 */
export function activeStreak(today: DailyResult | null, yesterday: DailyResult | null): number {
  if (today) return today.streak;
  return yesterday?.won ? yesterday.streak : 0;
}
