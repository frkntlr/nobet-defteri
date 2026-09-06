import type { IsoDate, Separation, Shift } from "../types";
import type { Cell } from "../types";

export function pairKey(a: string, b: string) {
  return a < b ? `${a}\0${b}` : `${b}\0${a}`;
}

export function makePair(a: string, b: string): { employeeIdA: string; employeeIdB: string } | null {
  if (!a || !b || a === b) return null;
  return a < b ? { employeeIdA: a, employeeIdB: b } : { employeeIdA: b, employeeIdB: a };
}

export function hasPair(list: Separation[], a: string, b: string) {
  const pair = makePair(a, b);
  if (!pair) return false;
  return list.some((s) => s.employeeIdA === pair.employeeIdA && s.employeeIdB === pair.employeeIdB);
}

export function pairSet(list: Separation[]) {
  return new Set(list.map((s) => pairKey(s.employeeIdA, s.employeeIdB)));
}

export function partnersOf(employeeId: string, pairs: Set<string>) {
  const out: string[] = [];
  for (const key of pairs) {
    const [a, b] = key.split("\0");
    if (a === employeeId && b) out.push(b);
    if (b === employeeId && a) out.push(a);
  }
  return out;
}

export function cellKey(employeeId: string, date: IsoDate) {
  return `${employeeId}|${date}`;
}

export function clashesWith(
  separations: Separation[],
  employeeId: string,
  date: IsoDate,
  shift: Shift,
  cells: Record<string, Cell>,
) {
  if (shift !== "morning" && shift !== "night") return [];
  const pairs = pairSet(separations);
  return partnersOf(employeeId, pairs).filter((other) => cells[cellKey(other, date)]?.shift === shift);
}
