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
