import type {
  AppState,
  Cell,
  CoverageIssue,
  Employee,
  Gender,
  HourRow,
  IsoDate,
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

function isWork(shift: Shift | undefined): shift is WorkShift {
  return shift === "morning" || shift === "night";
}

function maxStreak(employee: Pick<Employee, "workDays" | "offDays">, settings: Settings) {
  return cycleWorkOff(employee, settings).work;
}

function minOff(employee: Pick<Employee, "workDays" | "offDays">, settings: Settings) {
  return cycleWorkOff(employee, settings).off;
}

function minFor(settings: Settings, gender: Gender, shift: WorkShift) {
  if (gender === "male") {
    return shift === "morning" ? settings.minMaleMorning : Math.max(MALE_NIGHT_FLOOR, settings.minMaleNight);
  }
  return shift === "morning" ? settings.minFemaleMorning : settings.minFemaleNight;
}

function nightTarget(settings: Settings, gender: Gender) {
  if (gender === "male") {
    return Math.max(MALE_NIGHT_FLOOR, settings.minMaleNight, settings.preferMaleNight);
  }
  return settings.minFemaleNight;
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
        ? night.reduce((a, b) => a + (b >= 2 ? 520 : b === 1 ? 240 : 0), 0)
        : minN * 280;
    const emptyPenalty = gender === "male" ? 500 : 280;
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
      (gender === "male" ? minM * emptyPenalty + nightBonus : minM * emptyPenalty + minN * emptyPenalty) -
      varM -
      varN -
      extraMorning * 420 -
      extraNight * 280 -
      targetPenalty * 6 -
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

function canTake(
  employee: Employee,
  date: IsoDate,
  shift: WorkShift,
  cells: Record<string, Cell>,
  leaves: AppState["leaves"],
  manuals: Map<string, Shift>,
  settings: Settings,
) {
  if (!patternAllowsShift(employee, shift)) return false;
  if (!selectedDayAllows(employee, date, shift)) return false;
  if (!fitsWorkOffRhythm(employee, date, cells, leaves, manuals, settings)) return false;
  return !nightMorningClash(employee, date, shift, cells, leaves, manuals, settings);
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

function restPairScore(
  employee: Employee,
  date: IsoDate,
  shift: WorkShift,
  cells: Record<string, Cell>,
  leaves: AppState["leaves"],
  manuals: Map<string, Shift>,
  settings: Settings,
) {
  if (shift === "night") {
    return resolvedShift(employee, shiftIso(date, -1), cells, leaves, manuals, settings) === "morning" ? 2 : 0;
  }
  return resolvedShift(employee, shiftIso(date, 1), cells, leaves, manuals, settings) === "night" ? 2 : 0;
}

function blockedDays(employeeId: string, days: IsoDate[], cells: Record<string, Cell>) {
  return days.reduce((n, d) => {
    const cell = cells[cellKey(employeeId, d)];
    if (cell && (cell.shift === "leave" || (cell.source === "manual" && cell.shift === "off"))) return n + 1;
    return n;
  }, 0);
}

function requiredWork(employeeId: string, days: IsoDate[], cells: Record<string, Cell>, target: number) {
  if (target <= 0) return 0;
  return Math.max(0, target - blockedDays(employeeId, days, cells));
}

function countOn(
  date: IsoDate,
  shift: WorkShift,
  gender: Gender,
  employees: Employee[],
  cells: Record<string, Cell>,
) {
  return employees.filter(
    (e) => e.active && e.gender === gender && cells[cellKey(e.id, date)]?.shift === shift,
  ).length;
}

function locked(cell: Cell | undefined) {
  return cell?.source === "manual" || cell?.source === "leave";
}

function setOff(cells: Record<string, Cell>, key: string, employee?: Employee, date?: IsoDate) {
  const cell = cells[key];
  if (!cell || locked(cell) || !isWork(cell.shift)) return false;
  if (employee && date && pinnedOn(employee, date)) return false;
  cells[key] = { ...cell, shift: "off", source: "adjust" };
  return true;
}

function enforcePinnedWeekdays(days: IsoDate[], employees: Employee[], cells: Record<string, Cell>) {
  for (const person of employees.filter((e) => e.active && hasWeekdayFilter(e))) {
    for (const date of days) {
      if (!pinnedOn(person, date)) continue;
      const key = cellKey(person.id, date);
      const cell = cells[key];
      if (!cell || locked(cell)) continue;
      const want: WorkShift = person.pattern === "fixed_night" ? "night" : "morning";
      if (cell.shift !== want) cells[key] = { ...cell, shift: want, source: "adjust" };
    }
  }
}

function assignFill(
  employee: Employee,
  date: IsoDate,
  shift: WorkShift,
  cells: Record<string, Cell>,
  fills: Record<string, number>,
) {
  const key = cellKey(employee.id, date);
  const cell = cells[key];
  if (!cell) return;
  cells[key] = { ...cell, shift, source: "fill" };
  fills[employee.id] = (fills[employee.id] ?? 0) + 1;
}

type FillPick = {
  employee: Employee;
  work: number;
  deficit: number;
  sameShift: number;
  rest: number;
};

function pickFillCandidate(
  date: IsoDate,
  shift: WorkShift,
  gender: Gender,
  pool: Employee[],
  cells: Record<string, Cell>,
  fills: Record<string, number>,
  days: IsoDate[],
  leaves: AppState["leaves"],
  manuals: Map<string, Shift>,
  settings: Settings,
  pairs: Set<string>,
  options?: { relaxStreak?: boolean },
): Employee | null {
  const ranked: FillPick[] = [];
  for (const person of pool.filter((e) => e.active && e.gender === gender)) {
    const cell = cells[cellKey(person.id, date)];
    if (!cell || locked(cell) || cell.shift !== "off") continue;
    if (!patternAllowsShift(person, shift) || !selectedDayAllows(person, date, shift)) continue;
    if (!options?.relaxStreak && !canTake(person, date, shift, cells, leaves, manuals, settings)) continue;
    if (
      options?.relaxStreak &&
      (nightMorningClash(person, date, shift, cells, leaves, manuals, settings) ||
        !fitsWorkOffRhythm(person, date, cells, leaves, manuals, settings))
    ) {
      continue;
    }
    if (partnerClash(person.id, date, shift, cells, pairs)) continue;
    const work = workCount(person.id, days, cells);
    const need = requiredWork(person.id, days, cells, settings.targetWorkDays);
    ranked.push({
      employee: person,
      work,
      deficit: need - work,
      sameShift: sameShiftCount(person.id, days, cells, shift),
      rest: restPairScore(person, date, shift, cells, leaves, manuals, settings),
    });
  }
  ranked.sort(
    (a, b) =>
      b.rest - a.rest ||
      b.deficit - a.deficit ||
      a.work - b.work ||
      a.sameShift - b.sameShift ||
      (fills[a.employee.id] ?? 0) - (fills[b.employee.id] ?? 0) ||
      a.employee.name.localeCompare(b.employee.name, "tr"),
  );
  return ranked[0]?.employee ?? null;
}

function preferredShiftForFill(
  employee: Employee,
  date: IsoDate,
  active: Employee[],
  cells: Record<string, Cell>,
  leaves: AppState["leaves"],
  manuals: Map<string, Shift>,
  settings: Settings,
): WorkShift | null {
  if (employee.pattern === "fixed_morning" || employee.pattern === "selected_morning") return "morning";
  if (employee.pattern === "fixed_night") return "night";
  const prevMorning = resolvedShift(employee, shiftIso(date, -1), cells, leaves, manuals, settings) === "morning";
  if (employee.gender === "male") {
    const nights = countOn(date, "night", "male", active, cells);
    const mornings = countOn(date, "morning", "male", active, cells);
    if ((prevMorning && nights < settings.preferMaleNight) || nights < settings.preferMaleNight) return "night";
    if (mornings < settings.minMaleMorning) return "morning";
    if (nights < settings.preferMaleNight + 1) return "night";
    return null;
  }
  return prevMorning || employee.pattern === "rotating" ? "night" : "morning";
}

function fillTargetHours(
  days: IsoDate[],
  employees: Employee[],
  cells: Record<string, Cell>,
  fills: Record<string, number>,
  leaves: AppState["leaves"],
  manuals: Map<string, Shift>,
  settings: Settings,
  pairs: Set<string>,
) {
  const target = settings.targetWorkDays;
  if (target <= 0) return;
  const active = employees.filter((e) => e.active);
  for (const person of active) {
    if (hasWeekdayFilter(person)) continue;
    const need = requiredWork(person.id, days, cells, target);
    let guard = 0;
    while (workCount(person.id, days, cells) < need && guard < days.length * 2) {
      guard += 1;
      let paired: IsoDate | null = null;
      let isolated: IsoDate | null = null;
      for (const date of days) {
        const cell = cells[cellKey(person.id, date)];
        if (!cell || locked(cell) || cell.shift !== "off") continue;
        const shift = preferredShiftForFill(person, date, active, cells, leaves, manuals, settings);
        if (!shift) continue;
        if (!canTake(person, date, shift, cells, leaves, manuals, settings)) continue;
        if (partnerClash(person.id, date, shift, cells, pairs)) continue;
        if (
          person.gender === "male" &&
          shift === "morning" &&
          countOn(date, "morning", "male", active, cells) >= settings.minMaleMorning
        ) {
          continue;
        }
        const before = streakDir(person, date, -1, cells, leaves, manuals, settings);
        const after = streakDir(person, date, 1, cells, leaves, manuals, settings);
        if (before === 1 || after === 1) {
          paired = date;
          break;
        }
        if (!isolated) isolated = date;
      }
      const date = paired ?? isolated;
      if (!date) break;
      const shift = preferredShiftForFill(person, date, active, cells, leaves, manuals, settings);
      if (!shift) break;
      assignFill(person, date, shift, cells, fills);
    }
  }
}

function stripNightThenMorning(
  days: IsoDate[],
  employees: Employee[],
  cells: Record<string, Cell>,
  leaves: AppState["leaves"],
  manuals: Map<string, Shift>,
  settings: Settings,
) {
  const inMonth = new Set(days);
  const active = employees.filter((e) => e.active);
  for (const person of active) {
    for (const date of days) {
      const key = cellKey(person.id, date);
      const cell = cells[key];
      if (cell?.shift !== "morning") continue;
      const prev = shiftIso(date, -1);
      if (resolvedShift(person, prev, cells, leaves, manuals, settings) !== "night") continue;
      if (!locked(cell) && !pinnedOn(person, date)) {
        setOff(cells, key, person, date);
        continue;
      }
      if (inMonth.has(prev)) setOff(cells, cellKey(person.id, prev), person, prev);
    }
  }
}

function trimOverStreak(days: IsoDate[], employees: Employee[], cells: Record<string, Cell>, settings: Settings) {
  const active = employees.filter((e) => e.active);
  for (const person of active) {
    if (!usesWorkOffCycle(person) || hasWeekdayFilter(person)) continue;
    const cap = maxStreak(person, settings);
    let guard = 0;
    restart: while (guard < days.length) {
      guard += 1;
      let run = 0;
      let start = 0;
      for (let i = 0; i < days.length; i += 1) {
        const date = days[i];
        const cell = cells[cellKey(person.id, date)];
        if (isWork(cell?.shift)) {
          if (run === 0) start = i;
          run += 1;
          if (run > cap) {
            for (let j = i; j >= start; j -= 1) {
              const d = days[j];
              if (!d) continue;
              const c = cells[cellKey(person.id, d)];
              if (!c || locked(c)) continue;
              if (pinnedOn(person, d)) continue;
              if (
                person.gender === "male" &&
                c.shift === "morning" &&
                countOn(d, "morning", "male", active, cells) <= settings.minMaleMorning
              ) {
                continue;
              }
              if (
                person.gender === "male" &&
                c.shift === "night" &&
                countOn(d, "night", "male", active, cells) <= Math.max(MALE_NIGHT_FLOOR, settings.minMaleNight)
              ) {
                continue;
              }
              cells[cellKey(person.id, d)] = { ...c, shift: "off", source: "adjust" };
              continue restart;
            }
            run = cap;
          }
        } else {
          run = 0;
        }
      }
      break;
    }
  }
}

function femaleManualOff(date: IsoDate, gender: Gender, employees: Employee[], cells: Record<string, Cell>) {
  return employees.some((e) => {
    if (!e.active || e.gender !== gender) return false;
    const cell = cells[cellKey(e.id, date)];
    return cell?.source === "leave" || (cell?.source === "manual" && (cell.shift === "off" || cell.shift === "leave"));
  });
}

function trimMaleNightSurplus(
  date: IsoDate,
  employees: Employee[],
  cells: Record<string, Cell>,
  days: IsoDate[],
  keep: number,
) {
  if (keep <= 0) return;
  const nights = employees.filter(
    (e) => e.active && e.gender === "male" && cells[cellKey(e.id, date)]?.shift === "night",
  );
  const manuals = nights.filter((e) => cells[cellKey(e.id, date)]?.source === "manual");
  if (manuals.length >= keep || nights.length <= keep) return;
  const auto = nights
    .filter((e) => cells[cellKey(e.id, date)]?.source !== "manual")
    .sort(
      (a, b) =>
        workCount(a.id, days, cells) - workCount(b.id, days, cells) || a.name.localeCompare(b.name, "tr"),
    );
  const keepAuto = Math.max(0, keep - manuals.length);
  for (const person of auto.slice(keepAuto)) {
    const key = cellKey(person.id, date);
    const cell = cells[key];
    if (cell) cells[key] = { ...cell, shift: "off", source: "adjust" };
  }
}

function trimMaleMorningSurplus(date: IsoDate, employees: Employee[], cells: Record<string, Cell>, keep: number) {
  if (keep <= 0) return;
  const mornings = employees.filter(
    (e) =>
      e.active &&
      e.gender === "male" &&
      e.pattern !== "selected_morning" &&
      !pinnedOn(e, date) &&
      cells[cellKey(e.id, date)]?.shift === "morning",
  );
  const manuals = mornings.filter((e) => cells[cellKey(e.id, date)]?.source === "manual");
  if (manuals.length >= 2 || mornings.length <= keep) return;
  const auto = mornings
    .filter((e) => cells[cellKey(e.id, date)]?.source !== "manual")
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const keepAuto = Math.max(0, keep - manuals.length);
  for (const person of auto.slice(keepAuto)) {
    const key = cellKey(person.id, date);
    const cell = cells[key];
    if (cell) cells[key] = { ...cell, shift: "off", source: "adjust" };
  }
}

function pickMorningToNight(
  date: IsoDate,
  gender: Gender,
  pool: Employee[],
  cells: Record<string, Cell>,
  days: IsoDate[],
  leaves: AppState["leaves"],
  manuals: Map<string, Shift>,
  settings: Settings,
  pairs: Set<string>,
) {
  const prev = shiftIso(date, -1);
  const next = shiftIso(date, 1);
  const mornings = countOn(date, "morning", gender, pool, cells);
  const morningMin = minFor(settings, gender, "morning");
  const ranked = pool
    .filter((e) => e.active && e.gender === gender)
    .map((person) => {
      if (person.pattern === "fixed_morning" || person.pattern === "selected_morning") return null;
      const cell = cells[cellKey(person.id, date)];
      if (!cell || locked(cell) || cell.shift !== "morning") return null;
      if (resolvedShift(person, next, cells, leaves, manuals, settings) === "morning") return null;
      const prevShift = resolvedShift(person, prev, cells, leaves, manuals, settings);
      if (prevShift === "night" || partnerClash(person.id, date, "night", cells, pairs)) return null;
      return {
        employee: person,
        surplus: +(mornings > morningMin),
        restPair: +(prevShift === "morning"),
        nights: sameShiftCount(person.id, days, cells, "night"),
        work: workCount(person.id, days, cells),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort(
      (a, b) =>
        b.surplus - a.surplus ||
        b.restPair - a.restPair ||
        a.nights - b.nights ||
        a.work - b.work ||
        a.employee.name.localeCompare(b.employee.name, "tr"),
    );
  return ranked[0]?.employee ?? null;
}

function convertMorningToNight(
  date: IsoDate,
  gender: Gender,
  pool: Employee[],
  cells: Record<string, Cell>,
  fills: Record<string, number>,
  days: IsoDate[],
  leaves: AppState["leaves"],
  manuals: Map<string, Shift>,
  settings: Settings,
  pairs: Set<string>,
) {
  const person = pickMorningToNight(date, gender, pool, cells, days, leaves, manuals, settings, pairs);
  if (!person) return false;
  const morningMin = minFor(settings, gender, "morning");
  const mornings = countOn(date, "morning", gender, pool, cells);
  let replacement: Employee | null = null;
  if (mornings <= morningMin) {
    replacement = pickFillCandidate(
      date,
      "morning",
      gender,
      pool,
      cells,
      fills,
      days,
      leaves,
      manuals,
      settings,
      pairs,
    );
    if (!replacement) return false;
  }
  assignFill(person, date, "night", cells, fills);
  if (replacement) assignFill(replacement, date, "morning", cells, fills);
  return true;
}

function fillGaps(
  days: IsoDate[],
  employees: Employee[],
  cells: Record<string, Cell>,
  fills: Record<string, number>,
  leaves: AppState["leaves"],
  manuals: Map<string, Shift>,
  settings: Settings,
  dayCount: (date: IsoDate, shift: WorkShift) => number,
  pairs: Set<string>,
) {
  const active = employees.filter((e) => e.active);
  if (active.length === 0) return;
  const maxIter = Math.max(48, days.length * active.length);
  let changed = true;
  let iter = 0;
  while (changed && iter < maxIter) {
    changed = false;
    iter += 1;
    for (const date of days) {
      for (const gender of ["male", "female"] as const) {
        if (gender === "female" && !settings.autoFillFemale) continue;
        if (gender === "female" && femaleManualOff(date, gender, active, cells)) continue;
        const pool = active.filter((e) => e.gender === gender);
        const morningMin = minFor(settings, gender, "morning");
        const nightMin = nightTarget(settings, gender);
        while (countOn(date, "morning", gender, active, cells) < morningMin) {
          const pick = pickFillCandidate(
            date,
            "morning",
            gender,
            pool,
            cells,
            fills,
            days,
            leaves,
            manuals,
            settings,
            pairs,
          );
          if (!pick) break;
          assignFill(pick, date, "morning", cells, fills);
          changed = true;
        }
        while (countOn(date, "night", gender, active, cells) < nightMin) {
          const pick = pickFillCandidate(
            date,
            "night",
            gender,
            pool,
            cells,
            fills,
            days,
            leaves,
            manuals,
            settings,
            pairs,
          );
          if (pick) {
            assignFill(pick, date, "night", cells, fills);
            changed = true;
            continue;
          }
          if (!convertMorningToNight(date, gender, pool, cells, fills, days, leaves, manuals, settings, pairs)) {
            break;
          }
          changed = true;
        }
      }
      for (const shift of ["morning", "night"] as const) {
        const need = shift === "morning" ? settings.minMorning : settings.minNight;
        if (need <= 0) continue;
        while (dayCount(date, shift) < need) {
          const pick =
            pickFillCandidate(date, shift, "male", active, cells, fills, days, leaves, manuals, settings, pairs) ??
            pickFillCandidate(date, shift, "female", active, cells, fills, days, leaves, manuals, settings, pairs);
          if (!pick || (pick.gender === "female" && !settings.autoFillFemale)) break;
          assignFill(pick, date, shift, cells, fills);
          changed = true;
        }
      }
    }
  }
}

function trimCoverage(days: IsoDate[], employees: Employee[], cells: Record<string, Cell>, settings: Settings) {
  for (const date of days) {
    trimMaleMorningSurplus(date, employees, cells, settings.minMaleMorning);
    trimMaleNightSurplus(date, employees, cells, days, settings.preferMaleNight);
  }
}

function splitSeparations(days: IsoDate[], employees: Employee[], cells: Record<string, Cell>, pairs: Set<string>) {
  if (pairs.size === 0) return;
  const active = employees.filter((e) => e.active);
  for (const date of days) {
    for (const shift of ["morning", "night"] as const) {
      const on = active.filter((e) => cells[cellKey(e.id, date)]?.shift === shift);
      if (on.length < 2) continue;
      for (let i = 0; i < on.length; i += 1) {
        for (let j = i + 1; j < on.length; j += 1) {
          const a = on[i];
          const b = on[j];
          if (!a || !b || !pairs.has(pairKey(a.id, b.id))) continue;
          const cellA = cells[cellKey(a.id, date)];
          const cellB = cells[cellKey(b.id, date)];
          if (locked(cellA) && locked(cellB)) continue;
          const pinA = pinnedOn(a, date);
          const pinB = pinnedOn(b, date);
          if (pinA && !pinB && !locked(cellB)) {
            setOff(cells, cellKey(b.id, date), b, date);
          } else if (pinB && !pinA && !locked(cellA)) {
            setOff(cells, cellKey(a.id, date), a, date);
          } else if (!locked(cellA) && (locked(cellB) || workCount(a.id, days, cells) >= workCount(b.id, days, cells))) {
            if (!pinA) setOff(cells, cellKey(a.id, date), a, date);
            else if (!pinB) setOff(cells, cellKey(b.id, date), b, date);
          } else if (!pinB) {
            setOff(cells, cellKey(b.id, date), b, date);
          } else if (!pinA) {
            setOff(cells, cellKey(a.id, date), a, date);
          }
        }
      }
    }
  }
}

function findClashes(days: IsoDate[], employees: Employee[], cells: Record<string, Cell>, pairs: Set<string>) {
  if (pairs.size === 0) return [];
  const active = employees.filter((e) => e.active);
  const out: ScheduleResult["separationClashes"] = [];
  const seen = new Set<string>();
  for (const date of days) {
    for (const shift of ["morning", "night"] as const) {
      const on = active.filter((e) => cells[cellKey(e.id, date)]?.shift === shift);
      for (let i = 0; i < on.length; i += 1) {
        for (let j = i + 1; j < on.length; j += 1) {
          const a = on[i];
          const b = on[j];
          if (!a || !b || !pairs.has(pairKey(a.id, b.id))) continue;
          const id = `${date}|${shift}|${pairKey(a.id, b.id)}`;
          if (seen.has(id)) continue;
          seen.add(id);
          const [left, right] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
          out.push({ date, shift, employeeIdA: left ?? a.id, employeeIdB: right ?? b.id });
        }
      }
    }
  }
  return out;
}

/** Last pass: every night must have at least one male, even after manuals. */
function fillMandatoryMaleNights(
  days: IsoDate[],
  employees: Employee[],
  cells: Record<string, Cell>,
  fills: Record<string, number>,
  leaves: AppState["leaves"],
  manuals: Map<string, Shift>,
  settings: Settings,
  pairs: Set<string>,
) {
  const active = employees.filter((e) => e.active);
  const males = active.filter((e) => e.gender === "male");
  if (males.length === 0) return;
  const need = Math.max(MALE_NIGHT_FLOOR, settings.minMaleNight);
  for (const date of days) {
    let guard = 0;
    while (countOn(date, "night", "male", active, cells) < need && guard < males.length + 4) {
      guard += 1;
      const pick = pickFillCandidate(date, "night", "male", males, cells, fills, days, leaves, manuals, settings, pairs);
      if (pick) {
        assignFill(pick, date, "night", cells, fills);
        continue;
      }
      if (convertMorningToNight(date, "male", males, cells, fills, days, leaves, manuals, settings, pairs)) {
        continue;
      }
      break;
    }
  }
}

function continuesOutsideMonth(employee: Employee, days: IsoDate[], start: number, end: number, settings: Settings) {
  const first = days[start];
  const last = days[end];
  if (start === 0 && first && isWork(patternShift(employee, fromIso(shiftIso(first, -1)), settings))) return true;
  if (end === days.length - 1 && last && isWork(patternShift(employee, fromIso(shiftIso(last, 1)), settings))) return true;
  return false;
}

/** Elle çiftin bir günü off olunca ortada kalan tek iş gününü kapatır. */
function trimShortWorkBlocks(
  days: IsoDate[],
  employees: Employee[],
  cells: Record<string, Cell>,
  settings: Settings,
  fills: Record<string, number>,
  leaves: AppState["leaves"],
  manuals: Map<string, Shift>,
  pairs: Set<string>,
) {
  const active = employees.filter((e) => e.active);
  const males = active.filter((e) => e.gender === "male");
  for (const person of active) {
    if (!usesWorkOffCycle(person) || hasWeekdayFilter(person)) continue;
    const need = maxStreak(person, settings);
    let i = 0;
    while (i < days.length) {
      if (!isWork(cells[cellKey(person.id, days[i])]?.shift)) {
        i += 1;
        continue;
      }
      let j = i + 1;
      while (j < days.length && isWork(cells[cellKey(person.id, days[j])]?.shift)) j += 1;
      const runLen = j - i;
      if (runLen < need && !continuesOutsideMonth(person, days, i, j - 1, settings)) {
        for (let k = i; k < j; k += 1) {
          const date = days[k];
          if (!date) continue;
          const key = cellKey(person.id, date);
          const cell = cells[key];
          if (!cell || locked(cell) || !isWork(cell.shift)) continue;
          if (
            person.gender === "male" &&
            cell.shift === "night" &&
            countOn(date, "night", "male", active, cells) <= Math.max(MALE_NIGHT_FLOOR, settings.minMaleNight)
          ) {
            const other = pickFillCandidate(
              date,
              "night",
              "male",
              males.filter((e) => e.id !== person.id),
              cells,
              fills,
              days,
              leaves,
              manuals,
              settings,
              pairs,
            );
            if (other) assignFill(other, date, "night", cells, fills);
            else {
              convertMorningToNight(
                date,
                "male",
                males.filter((e) => e.id !== person.id),
                cells,
                fills,
                days,
                leaves,
                manuals,
                settings,
                pairs,
              );
            }
          }
          cells[key] = { ...cell, shift: "off", source: "adjust" };
        }
      }
      i = j;
    }
  }
}

function restoreShortOffGaps(days: IsoDate[], employees: Employee[], cells: Record<string, Cell>, settings: Settings) {
  const active = employees.filter((e) => e.active);
  for (const person of active) {
    if (!usesWorkOffCycle(person) || hasWeekdayFilter(person)) continue;
    const needOff = minOff(person, settings);
    let guard = 0;
    restart: while (guard < days.length) {
      guard += 1;
      let i = 0;
      while (i < days.length) {
        if (!isWork(cells[cellKey(person.id, days[i])]?.shift)) {
          i += 1;
          continue;
        }
        let j = i + 1;
        while (j < days.length && isWork(cells[cellKey(person.id, days[j])]?.shift)) j += 1;
        const offStart = j;
        while (j < days.length && !isWork(cells[cellKey(person.id, days[j])]?.shift)) j += 1;
        const offLen = j - offStart;
        const hasLaterWork = j < days.length && isWork(cells[cellKey(person.id, days[j])]?.shift);
        if (hasLaterWork && offLen > 0 && offLen < needOff) {
          const leftDate = days[j - offLen - 1];
          const rightDate = days[j];
          const candidates = [leftDate, rightDate].filter((d): d is IsoDate => !!d);
          for (const date of candidates) {
            const key = cellKey(person.id, date);
            const cell = cells[key];
            if (!cell || locked(cell) || !isWork(cell.shift)) continue;
            if (
              person.gender === "male" &&
              cell.shift === "night" &&
              countOn(date, "night", "male", active, cells) <= Math.max(MALE_NIGHT_FLOOR, settings.minMaleNight)
            ) {
              continue;
            }
            cells[key] = { ...cell, shift: "off", source: "adjust" };
            continue restart;
          }
        }
        i = offStart === i + 1 ? offStart : Math.max(offStart, i + 1);
      }
      break;
    }
  }
}

function collectRhythmBreaks(days: IsoDate[], employees: Employee[], cells: Record<string, Cell>, settings: Settings): RhythmBreak[] {
  const out: RhythmBreak[] = [];
  for (const person of employees.filter((e) => e.active && usesWorkOffCycle(e) && !hasWeekdayFilter(e))) {
    const cap = maxStreak(person, settings);
    const needOff = minOff(person, settings);
    let run = 0;
    let runStart = 0;
    const flushRun = (endExclusive: number) => {
      if (run === 0) return;
      const last = endExclusive - 1;
      if (run > cap) {
        const date = days[last];
        if (date) out.push({ employeeId: person.id, date, kind: "streak" });
      } else if (run < cap && !continuesOutsideMonth(person, days, runStart, last, settings)) {
        const date = days[runStart];
        if (date) out.push({ employeeId: person.id, date, kind: "short_work" });
      }
    };
    for (let i = 0; i < days.length; i += 1) {
      const date = days[i];
      if (isWork(cells[cellKey(person.id, date)]?.shift)) {
        if (run === 0) runStart = i;
        run += 1;
      } else {
        flushRun(i);
        if (run > 0) {
          let off = 0;
          let j = i;
          while (j < days.length && !isWork(cells[cellKey(person.id, days[j])]?.shift)) {
            off += 1;
            j += 1;
          }
          if (j < days.length && off < needOff && cells[cellKey(person.id, date)]?.shift !== "leave") {
            out.push({ employeeId: person.id, date, kind: "short_off" });
          }
        }
        run = 0;
      }
    }
    flushRun(days.length);
  }
  return out;
}

function collectMaleNightGaps(
  days: IsoDate[],
  employees: Employee[],
  cells: Record<string, Cell>,
  settings: Settings,
): MaleNightGap[] {
  const males = employees.filter((e) => e.active && e.gender === "male");
  if (males.length === 0) return [];
  const need = Math.max(MALE_NIGHT_FLOOR, settings.minMaleNight);
  const gaps: MaleNightGap[] = [];
  for (const date of days) {
    const actual = countOn(date, "night", "male", males, cells);
    if (actual >= need) continue;
    const allLeave = males.every((e) => cells[cellKey(e.id, date)]?.shift === "leave");
    const remainingLocked = males.every((e) => {
      const cell = cells[cellKey(e.id, date)];
      return cell?.shift === "leave" || (locked(cell) && cell?.shift !== "night");
    });
    gaps.push({
      date,
      actual,
      needed: need,
      reason: allLeave ? "leave" : remainingLocked ? "manual" : "empty",
    });
  }
  return gaps;
}

export function wouldEmptyMaleNight(
  result: ScheduleResult,
  employees: Employee[],
  employeeId: string,
  date: IsoDate,
  nextShift: Shift,
  settings: Settings,
) {
  const person = employees.find((e) => e.id === employeeId);
  if (!person || person.gender !== "male") return false;
  const cell = result.cells[cellKey(employeeId, date)];
  if (cell?.shift !== "night") return false;
  if (nextShift === "night") return false;
  const males = employees.filter((e) => e.active && e.gender === "male");
  if (males.length === 0) return false;
  const others = males.filter((e) => e.id !== employeeId && result.cells[cellKey(e.id, date)]?.shift === "night");
  return others.length < Math.max(MALE_NIGHT_FLOOR, settings.minMaleNight);
}

export function buildSchedule(
  employees: Employee[],
  leaves: AppState["leaves"],
  manuals: AppState["manuals"],
  settings: Settings,
  days: Date[],
  holidays: AppState["holidays"] = [],
  separations: Separation[] = [],
): ScheduleResult {
  const dayIsos = days.map(toIso);
  const cells: Record<string, Cell> = {};
  const active = employees.filter((e) => e.active);
  const manualMap = new Map<string, Shift>(manuals.map((m) => [`${m.employeeId}|${m.date}`, m.shift]));

  for (const person of employees) {
    for (const date of days) {
      const iso = toIso(date);
      const key = cellKey(person.id, iso);
      const original = patternShift(person, date, settings);
      const manual = manualMap.get(key);
      const leave = leaveOn(person.id, iso, leaves);
      if (manual) {
        cells[key] = {
          date: iso,
          employeeId: person.id,
          shift: manual,
          source: "manual",
          original,
          leaveType: manual === "leave" ? (leave?.type ?? "normal") : undefined,
        };
        continue;
      }
      if (leave) {
        cells[key] = {
          date: iso,
          employeeId: person.id,
          shift: "leave",
          source: "leave",
          original,
          leaveType: leave.type,
        };
        continue;
      }
      cells[key] = {
        date: iso,
        employeeId: person.id,
        shift: original,
        source: "auto",
        original,
      };
    }
  }

  const fills: Record<string, number> = {};
  const pairs = pairSet(separations);
  const dayCount = (date: IsoDate, shift: WorkShift) =>
    active.filter((e) => cells[cellKey(e.id, date)]?.shift === shift).length;

  const pass = () => {
    stripNightThenMorning(dayIsos, active, cells, leaves, manualMap, settings);
    trimOverStreak(dayIsos, active, cells, settings);
    restoreShortOffGaps(dayIsos, active, cells, settings);
    trimShortWorkBlocks(dayIsos, active, cells, settings, fills, leaves, manualMap, pairs);
    splitSeparations(dayIsos, active, cells, pairs);
    fillGaps(dayIsos, active, cells, fills, leaves, manualMap, settings, dayCount, pairs);
    trimCoverage(dayIsos, active, cells, settings);
  };

  pass();
  fillGaps(dayIsos, active, cells, fills, leaves, manualMap, settings, dayCount, pairs);
  fillTargetHours(dayIsos, active, cells, fills, leaves, manualMap, settings, pairs);
  pass();
  fillTargetHours(dayIsos, active, cells, fills, leaves, manualMap, settings, pairs);
  fillGaps(dayIsos, active, cells, fills, leaves, manualMap, settings, dayCount, pairs);
  pass();
  fillMandatoryMaleNights(dayIsos, active, cells, fills, leaves, manualMap, settings, pairs);
  trimOverStreak(dayIsos, active, cells, settings);
  restoreShortOffGaps(dayIsos, active, cells, settings);
  trimShortWorkBlocks(dayIsos, active, cells, settings, fills, leaves, manualMap, pairs);
  enforcePinnedWeekdays(dayIsos, active, cells);

  const issues: CoverageIssue[] = [];
  for (const date of dayIsos) {
    for (const gender of ["male", "female"] as const) {
      for (const shift of ["morning", "night"] as const) {
        const needed = minFor(settings, gender, shift);
        if (needed <= 0 || !active.some((e) => e.gender === gender)) continue;
        const actual = countOn(date, shift, gender, active, cells);
        if (actual < needed) {
          issues.push({ date, shift, section: gender, needed, actual });
        }
      }
    }
    const morning = dayCount(date, "morning");
    const night = dayCount(date, "night");
    if (settings.minMorning > 0 && morning < settings.minMorning) {
      issues.push({ date, shift: "morning", section: "male", needed: settings.minMorning, actual: morning });
    }
    if (settings.minNight > 0 && night < settings.minNight) {
      issues.push({ date, shift: "night", section: "male", needed: settings.minNight, actual: night });
    }
  }

  const maleNightGaps = collectMaleNightGaps(dayIsos, active, cells, settings);
  const rhythmBreaks = collectRhythmBreaks(dayIsos, active, cells, settings);

  const emptyHours = {
    annualDays: 0,
    normalDays: 0,
    dailyDays: 0,
    reportDays: 0,
    restDays: 0,
    unpaidDays: 0,
  };

  const hours: HourRow[] = employees.map((person) => {
    let workShifts = 0;
    let leaveDays = 0;
    let offDays = 0;
    let fillShifts = 0;
    let holidayWorkDays = 0;
    const leaveCounts = { ...emptyHours };
    for (const date of dayIsos) {
      const cell = cells[cellKey(person.id, date)];
      if (!cell) continue;
      if (cell.shift === "morning" || cell.shift === "night") {
        workShifts += 1;
        if (cell.source === "fill") fillShifts += 1;
        if (holidayOn(date, holidays)) holidayWorkDays += 1;
      } else if (cell.shift === "leave") {
        leaveDays += 1;
        const type = cell.leaveType ?? "normal";
        if (type === "annual") leaveCounts.annualDays += 1;
        if (type === "normal") leaveCounts.normalDays += 1;
        if (type === "daily") leaveCounts.dailyDays += 1;
        if (type === "report") leaveCounts.reportDays += 1;
        if (type === "rest") leaveCounts.restDays += 1;
        if (type === "unpaid") leaveCounts.unpaidDays += 1;
      } else {
        offDays += 1;
      }
    }
    return {
      employeeId: person.id,
      workShifts,
      hours: workShifts * settings.shiftHours,
      leaveDays,
      ...leaveCounts,
      offDays,
      fillShifts,
      holidayWorkDays,
      requiredWorkDays: requiredWork(person.id, dayIsos, cells, settings.targetWorkDays),
    };
  });

  return {
    days: dayIsos,
    cells,
    issues,
    maleNightGaps,
    rhythmBreaks,
    hours,
    separationClashes: findClashes(dayIsos, active, cells, pairs),
  };
}

export function dayCoverage(result: ScheduleResult, date: IsoDate, employees: Employee[]) {
  let morning = 0;
  let night = 0;
  let leave = 0;
  let maleMorning = 0;
  let maleNight = 0;
  let femaleMorning = 0;
  let femaleNight = 0;
  const genders = new Map(employees.map((e) => [e.id, e.gender]));
  for (const cell of Object.values(result.cells)) {
    if (cell.date !== date) continue;
    const gender = genders.get(cell.employeeId);
    if (cell.shift === "morning") {
      morning += 1;
      if (gender === "male") maleMorning += 1;
      if (gender === "female") femaleMorning += 1;
    } else if (cell.shift === "night") {
      night += 1;
      if (gender === "male") maleNight += 1;
      if (gender === "female") femaleNight += 1;
    } else if (cell.shift === "leave") {
      leave += 1;
    }
  }
  return { morning, night, leave, maleMorning, maleNight, femaleMorning, femaleNight };
}

export function genderMin(settings: Settings, gender: Gender, shift: WorkShift) {
  return minFor(settings, gender, shift);
}

export function scheduleForMonth(state: AppState, year: number, monthIndex: number) {
  return buildSchedule(
    state.employees,
    state.leaves,
    state.manuals,
    state.settings,
    monthDays(year, monthIndex),
    state.holidays,
    state.separations,
  );
}

export { cellKey, countOn, MALE_NIGHT_FLOOR };
