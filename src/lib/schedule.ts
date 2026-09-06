import type {
  AppState,
  Cell,
  CoverageIssue,
  Employee,
  Gender,
  HourRow,
  IsoDate,
  MaleCoverageGap,
  MaleNightGap,
  RhythmBreak,
  ScheduleResult,
  Separation,
  Settings,
  Shift,
  WorkShift,
} from "../types";
import {
  cycleSpec,
  cycleWorkOff,
  hasWeekdayFilter,
  isPinnedWeekday,
  offsetCandidates,
  patternShift,
  usesWorkOffCycle,
  weekdayAllowed,
} from "./cycle";
import { fromIso, monthDays, shiftIso, toIso } from "./dates";
import { holidayOn } from "./holidays";
import { leaveOn } from "./leaves";
import { cellKey, pairKey, pairSet, partnersOf } from "./separations";

const MALE_NIGHT_FLOOR = 1;
const MALE_MORNING_FLOOR = 1;

type FillRelax = "strict" | "rhythm" | "hard";

function isWork(shift: Shift | undefined): shift is WorkShift {
  return shift === "morning" || shift === "night";
}

function maxStreak(employee: Pick<Employee, "workDays" | "offDays">, settings: Settings) {
  return cycleWorkOff(employee, settings).work;
}

function minOff(employee: Pick<Employee, "workDays" | "offDays">, settings: Settings) {
  return cycleWorkOff(employee, settings).off;
}

function maleFloor(settings: Settings, shift: WorkShift) {
  return shift === "morning"
    ? Math.max(MALE_MORNING_FLOOR, settings.minMaleMorning)
    : Math.max(MALE_NIGHT_FLOOR, settings.minMaleNight);
}

function minFor(settings: Settings, gender: Gender, shift: WorkShift) {
  if (gender === "male") return maleFloor(settings, shift);
  return shift === "morning" ? settings.minFemaleMorning : settings.minFemaleNight;
}

function scoreOffsets(employees: Employee[], settings: Settings, horizon: number, separations: Separation[] = []) {
  const anchor = fromIso(settings.cycleAnchor);
  let score = 0;
  for (const gender of ["male", "female"] as const) {
    const morning = Array.from({ length: horizon }, () => 0);
    const night = Array.from({ length: horizon }, () => 0);
    const group = employees.filter((e) => e.active && e.gender === gender);
    if (group.length === 0) continue;
    for (const person of group) {
      for (let i = 0; i < horizon; i += 1) {
        const date = new Date(anchor);
        date.setDate(anchor.getDate() + i);
        const shift = patternShift(person, date, settings);
        if (shift === "morning") morning[i] += 1;
        if (shift === "night") night[i] += 1;
      }
    }
    const minM = Math.min(...morning);
    const minN = Math.min(...night);
    const avgM = morning.reduce((a, b) => a + b, 0) / horizon;
    const avgN = night.reduce((a, b) => a + b, 0) / horizon;
    const varM = morning.reduce((a, b) => a + (b - avgM) ** 2, 0);
    const varN = night.reduce((a, b) => a + (b - avgN) ** 2, 0);
    const extraMorning = gender === "male" ? morning.reduce((a, b) => a + Math.max(0, b - 1), 0) : 0;
    const extraNight = gender === "male" ? night.reduce((a, b) => a + Math.max(0, b - 2), 0) : 0;
    const nightBonus =
      gender === "male"
        ? night.reduce((a, b) => a + (b >= 2 ? 160 : b === 1 ? 80 : 0), 0)
        : minN * 280;
    const morningBonus = gender === "male" ? morning.reduce((a, b) => a + (b >= 1 ? 420 : 0), 0) : 0;
    const emptyPenalty = gender === "male" ? 720 : 280;
    let targetPenalty = 0;
    let streakPenalty = 0;
    const target = settings.targetWorkDays > 0 ? (settings.targetWorkDays * horizon) / 30 : 0;
    const streakCap = settings.workDays;
    let nightMorning = 0;
    for (const person of group) {
      let work = 0;
      let run = 0;
      let prev: Shift | null = null;
      for (let i = 0; i < horizon; i += 1) {
        const date = new Date(anchor);
        date.setDate(anchor.getDate() + i);
        const shift = patternShift(person, date, settings);
        if (prev === "night" && shift === "morning") nightMorning += 520;
        prev = shift;
        if (isWork(shift)) {
          work += 1;
          run += 1;
          if (run > streakCap) streakPenalty += 90;
        } else {
          run = 0;
        }
      }
      if (target > 0 && work < target) targetPenalty += (target - work) ** 2 * 4;
      else if (target > 0) targetPenalty += (work - target) ** 2;
    }
    score +=
      (gender === "male"
        ? minM * emptyPenalty + minN * emptyPenalty + morningBonus + nightBonus
        : minM * emptyPenalty + minN * emptyPenalty) -
      varM -
      varN -
      extraMorning * 420 -
      extraNight * 280 -
      targetPenalty * 8 -
      streakPenalty -
      nightMorning;
  }
  const pairs = pairSet(separations);
  if (pairs.size > 0) {
    let clash = 0;
    const active = employees.filter((e) => e.active);
    for (let i = 0; i < horizon; i += 1) {
      const morning = new Set<string>();
      const night = new Set<string>();
      for (const person of active) {
        const date = new Date(anchor);
        date.setDate(anchor.getDate() + i);
        const shift = patternShift(person, date, settings);
        if (shift === "morning") morning.add(person.id);
        if (shift === "night") night.add(person.id);
      }
      for (const key of pairs) {
        const [a, b] = key.split("\0");
        if (!a || !b) continue;
        if ((morning.has(a) && morning.has(b)) || (night.has(a) && night.has(b))) clash += 640;
      }
    }
    score -= clash;
  }
  return score;
}

export function balanceOffsets(employees: Employee[], settings: Settings, separations: Separation[] = []) {
  const next = employees.map((e) => ({ ...e }));
  for (const gender of ["male", "female"] as const) {
    for (const pattern of ["rotating", "fixed_morning", "fixed_night"] as const) {
      const group = next.filter((e) => e.gender === gender && e.pattern === pattern && e.autoOffset);
      if (group.length === 0) continue;
      const sample = group[0];
      const spec = cycleSpec(sample, settings);
      const candidates = offsetCandidates(spec.cycle, spec.work);
      for (const person of group) person.cycleOffset = candidates[0] ?? 0;
      for (const person of group) {
        let best = candidates[0] ?? 0;
        let bestScore = -Infinity;
        for (const offset of candidates) {
          person.cycleOffset = offset;
          const score = scoreOffsets(next, settings, spec.cycle, separations);
          if (score > bestScore) {
            bestScore = score;
            best = offset;
          }
        }
        person.cycleOffset = best;
      }
    }
  }
  return next;
}

export function bestOffsetFor(
  employee: Employee,
  others: Employee[],
  settings: Settings,
  separations: Separation[] = [],
) {
  if (!employee.autoOffset) return employee.cycleOffset;
  const spec = cycleSpec(employee, settings);
  const candidates = offsetCandidates(spec.cycle, spec.work);
  let best = candidates[0] ?? 0;
  let bestScore = -Infinity;
  const pool = [...others.filter((e) => e.active), employee];
  for (const offset of candidates) {
    employee.cycleOffset = offset;
    const score = scoreOffsets(pool, settings, spec.cycle, separations);
    if (score > bestScore) {
      bestScore = score;
      best = offset;
    }
  }
  return best;
}

function resolvedShift(
  employee: Employee,
  date: IsoDate,
  cells: Record<string, Cell>,
  leaves: AppState["leaves"],
  manuals: Map<string, Shift>,
  settings: Settings,
): Shift {
  const cell = cells[cellKey(employee.id, date)];
  if (cell) return cell.shift;
  return manuals.get(`${employee.id}|${date}`) || (leaveOn(employee.id, date, leaves) ? "leave" : patternShift(employee, fromIso(date), settings));
}

function streakDir(
  employee: Employee,
  date: IsoDate,
  dir: 1 | -1,
  cells: Record<string, Cell>,
  leaves: AppState["leaves"],
  manuals: Map<string, Shift>,
  settings: Settings,
) {
  let n = 0;
  for (let i = 1; i <= 8; i += 1) {
    if (!isWork(resolvedShift(employee, shiftIso(date, i * dir), cells, leaves, manuals, settings))) break;
    n += 1;
  }
  return n;
}

function offStreakDir(
  employee: Employee,
  date: IsoDate,
  dir: 1 | -1,
  cells: Record<string, Cell>,
  leaves: AppState["leaves"],
  manuals: Map<string, Shift>,
  settings: Settings,
) {
  let n = 0;
  for (let i = 1; i <= 12; i += 1) {
    const shift = resolvedShift(employee, shiftIso(date, i * dir), cells, leaves, manuals, settings);
    if (isWork(shift)) break;
    n += 1;
  }
  return n;
}

function hasWorkBeyond(
  employee: Employee,
  date: IsoDate,
  dir: 1 | -1,
  cells: Record<string, Cell>,
  leaves: AppState["leaves"],
  manuals: Map<string, Shift>,
  settings: Settings,
) {
  for (let i = 1; i <= 16; i += 1) {
    if (isWork(resolvedShift(employee, shiftIso(date, i * dir), cells, leaves, manuals, settings))) return true;
  }
  return false;
}

/** 2 iş / 2 off: blok en fazla `work` gün, bloklar arası en az `off` gün. */
function fitsWorkOffRhythm(
  employee: Employee,
  date: IsoDate,
  cells: Record<string, Cell>,
  leaves: AppState["leaves"],
  manuals: Map<string, Shift>,
  settings: Settings,
) {
  if (!usesWorkOffCycle(employee)) return true;
  const before = streakDir(employee, date, -1, cells, leaves, manuals, settings);
  const after = streakDir(employee, date, 1, cells, leaves, manuals, settings);
  if (before + 1 + after > maxStreak(employee, settings)) return false;
  const needOff = minOff(employee, settings);
  const blockStartOffset = -before;
  const blockEndOffset = after;
  const offBefore = offStreakDir(employee, shiftIso(date, blockStartOffset), -1, cells, leaves, manuals, settings);
  const offAfter = offStreakDir(employee, shiftIso(date, blockEndOffset), 1, cells, leaves, manuals, settings);
  if (hasWorkBeyond(employee, shiftIso(date, blockStartOffset), -1, cells, leaves, manuals, settings) && offBefore < needOff) {
    return false;
  }
  if (hasWorkBeyond(employee, shiftIso(date, blockEndOffset), 1, cells, leaves, manuals, settings) && offAfter < needOff) {
    return false;
  }
  return true;
}

function patternAllowsShift(employee: Employee, shift: WorkShift) {
  if (employee.pattern === "fixed_morning" || employee.pattern === "selected_morning") return shift === "morning";
  if (employee.pattern === "fixed_night") return shift === "night";
  return true;
}

function selectedDayAllows(employee: Employee, date: IsoDate, shift: WorkShift) {
  if (!hasWeekdayFilter(employee)) return true;
  if (!weekdayAllowed(employee, fromIso(date))) return false;
  if (employee.pattern === "selected_morning" || employee.pattern === "fixed_morning") return shift === "morning";
  if (employee.pattern === "fixed_night") return shift === "night";
  return true;
}

function pinnedOn(employee: Employee, date: IsoDate) {
  return isPinnedWeekday(employee, fromIso(date));
}

function nightMorningClash(
  employee: Employee,
  date: IsoDate,
  shift: WorkShift,
  cells: Record<string, Cell>,
  leaves: AppState["leaves"],
  manuals: Map<string, Shift>,
  settings: Settings,
) {
  if (shift === "morning") {
    return resolvedShift(employee, shiftIso(date, -1), cells, leaves, manuals, settings) === "night";
  }
  return resolvedShift(employee, shiftIso(date, 1), cells, leaves, manuals, settings) === "morning";
}

function canAssign(
  employee: Employee,
  date: IsoDate,
  shift: WorkShift,
  cells: Record<string, Cell>,
  leaves: AppState["leaves"],
  manuals: Map<string, Shift>,
  settings: Settings,
  relax: FillRelax = "strict",
) {
  if (!patternAllowsShift(employee, shift)) return false;
  if (!selectedDayAllows(employee, date, shift)) return false;
  if (relax === "hard") return true;
  if (nightMorningClash(employee, date, shift, cells, leaves, manuals, settings)) return false;
  if (relax === "rhythm") {
    const needOff = minOff(employee, settings);
    const before = streakDir(employee, date, -1, cells, leaves, manuals, settings);
    const after = streakDir(employee, date, 1, cells, leaves, manuals, settings);
    const offBefore = offStreakDir(employee, shiftIso(date, -before), -1, cells, leaves, manuals, settings);
    const offAfter = offStreakDir(employee, shiftIso(date, after), 1, cells, leaves, manuals, settings);
    if (hasWorkBeyond(employee, shiftIso(date, -before), -1, cells, leaves, manuals, settings) && offBefore < needOff) {
      return false;
    }
    if (hasWorkBeyond(employee, shiftIso(date, after), 1, cells, leaves, manuals, settings) && offAfter < needOff) {
      return false;
    }
    return true;
  }
  return fitsWorkOffRhythm(employee, date, cells, leaves, manuals, settings);
}

function wouldBreakMaleCoverage(
  employee: Employee,
  date: IsoDate,
  cells: Record<string, Cell>,
  active: Employee[],
  settings: Settings,
) {
  if (employee.gender !== "male") return false;
  const cell = cells[cellKey(employee.id, date)];
  if (!cell || !isWork(cell.shift)) return false;
  return countOn(date, cell.shift, "male", active, cells) <= maleFloor(settings, cell.shift);
}

function wouldMissTarget(
  employee: Employee,
  days: IsoDate[],
  cells: Record<string, Cell>,
  settings: Settings,
) {
  if (settings.targetWorkDays <= 0 || hasWeekdayFilter(employee)) return false;
  return workCount(employee.id, days, cells) <= requiredWork(employee.id, days, cells, settings.targetWorkDays);
}

function partnerClash(
  employeeId: string,
  date: IsoDate,
  shift: WorkShift,
  cells: Record<string, Cell>,
  pairs: Set<string>,
) {
  if (pairs.size === 0) return false;
  return partnersOf(employeeId, pairs).some((id) => cells[cellKey(id, date)]?.shift === shift);
}

function workCount(employeeId: string, days: IsoDate[], cells: Record<string, Cell>) {
  return days.reduce((n, d) => n + (isWork(cells[cellKey(employeeId, d)]?.shift) ? 1 : 0), 0);
}

function sameShiftCount(employeeId: string, days: IsoDate[], cells: Record<string, Cell>, shift: WorkShift) {
  return days.reduce((n, d) => n + (cells[cellKey(employeeId, d)]?.shift === shift ? 1 : 0), 0);
}
