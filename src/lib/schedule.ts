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
