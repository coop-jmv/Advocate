// Real conflict detection: two hearings on the same date and the same clock
// time. Extracted from app.diary.tsx (where this logic originated) so the
// Court Morning Brief can flag the exact same conflicts the diary does,
// rather than a second, possibly-diverging implementation. A hearing with no
// hearing_time is never counted — there's nothing to compare it against.
export type HearingForConflictCheck = {
  hearing_date: string;
  hearing_time: string | null;
};

export function findClashKeys<T extends HearingForConflictCheck>(hearings: T[]): Set<string> {
  const seen = new Map<string, number>();
  for (const h of hearings) {
    if (!h.hearing_time) continue;
    const key = `${h.hearing_date}|${h.hearing_time}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return new Set([...seen.entries()].filter(([, count]) => count > 1).map(([key]) => key));
}

export function isClashing(hearing: HearingForConflictCheck, clashKeys: Set<string>): boolean {
  if (!hearing.hearing_time) return false;
  return clashKeys.has(`${hearing.hearing_date}|${hearing.hearing_time}`);
}
