import type { Employee, Settings, Shift } from "../types";
import { daysBetween, weekdayMon0 } from "./dates";
import { positiveMod } from "./cn";

export function usesWorkOffCycle(employee: Pick<Employee, "pattern">) {
  return employee.pattern === "rotating" || employee.pattern === "fixed_morning" || employee.pattern === "fixed_night";
}

export function hasCustomRhythm(employee: Pick<Employee, "workDays" | "offDays">) {
  return employee.workDays != null || employee.offDays != null;
}

export function hasWeekdayFilter(employee: Pick<Employee, "pattern" | "workWeekdays">) {
  return employee.pattern === "selected_morning" || normalizeWeekdays(employee.workWeekdays).length > 0;
}

export function weekdayAllowed(employee: Pick<Employee, "pattern" | "workWeekdays">, date: Date) {
  const days = normalizeWeekdays(employee.workWeekdays);
  if (employee.pattern === "selected_morning") return days.includes(weekdayMon0(date));
  if (days.length === 0) return true;
  return days.includes(weekdayMon0(date));
}

/** İşaretlenen hafta günü: özel 2+2 ritim açık olsa bile o gün gelir. */
export function isPinnedWeekday(employee: Pick<Employee, "pattern" | "workWeekdays">, date: Date) {
  return hasWeekdayFilter(employee) && weekdayAllowed(employee, date);
}

export function cycleWorkOff(employee: Pick<Employee, "workDays" | "offDays">, settings: Settings) {
  return {
    work: Math.max(1, employee.workDays ?? settings.workDays),
    off: Math.max(1, employee.offDays ?? settings.offDays),
  };
}

export function cycleSpec(employee: Pick<Employee, "workDays" | "offDays" | "pattern">, settings: Settings) {
  const { work, off } = cycleWorkOff(employee, settings);
  const rotate = employee.pattern === "rotating" && settings.rotateShifts;
  return {
    work,
    off,
    rotate,
    cycle: Math.max(1, rotate ? (work + off) * 2 : work + off),
  };
}

export function normalizeWeekdays(days: number[] | undefined) {
  return [...new Set((days ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
}

export function patternShift(employee: Employee, date: Date, settings: Settings): Shift {
  if (employee.pattern === "selected_morning") {
    return weekdayAllowed(employee, date) ? "morning" : "off";
  }
  const { work, off, rotate, cycle } = cycleSpec(employee, settings);
  const slot = positiveMod(daysBetween(date, settings.cycleAnchor) + employee.cycleOffset, cycle);
  let shift: Shift = "off";
  if (employee.pattern === "fixed_morning") shift = slot < work ? "morning" : "off";
  else if (employee.pattern === "fixed_night") shift = slot < work ? "night" : "off";
  else if (rotate) {
    if (slot < work) shift = "morning";
    else if (slot < work + off) shift = "off";
    else if (slot < work + off + work) shift = "night";
    else shift = "off";
  } else {
    shift = slot < work ? "morning" : "off";
  }
  if (!hasWeekdayFilter(employee)) return shift;
  if (!weekdayAllowed(employee, date)) return "off";
  if (shift !== "off") return shift;
  if (employee.pattern === "fixed_night") return "night";
  return "morning";
}

export function offsetCandidates(cycle: number, work: number) {
  const step = Math.max(1, work);
  const seen = new Set<number>();
  const out: number[] = [];
  for (let i = 0; i < cycle; i += 1) {
    const v = (i * step) % cycle;
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  if (out.length === 0) out.push(0);
  return out;
}

export const WEEKDAY_LONG = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"] as const;
export const WEEKDAY_SHORT = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"] as const;

export function weekdayListLabel(days: number[]) {
  const normalized = normalizeWeekdays(days);
  if (normalized.length === 0) return "gün seçilmedi";
  return normalized.map((d) => WEEKDAY_SHORT[d]).join(", ");
}
