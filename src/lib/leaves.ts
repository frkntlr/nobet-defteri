import type { LeaveRecord, LeaveType } from "../types";
import { isoRange } from "./dates";

export const LEAVE_TYPES: LeaveType[] = [
  "annual",
  "normal",
  "daily",
  "report",
  "rest",
  "unpaid",
];

export const LEAVE_LABEL: Record<LeaveType, string> = {
  annual: "Yıllık izin",
  normal: "Normal izin",
  daily: "Günlük izin",
  report: "Rapor",
  rest: "İstirahat",
  unpaid: "Ücretsiz izin",
};

export const LEAVE_SHORT: Record<LeaveType, string> = {
  annual: "Y",
  normal: "N",
  daily: "D",
  report: "R",
  rest: "İs",
  unpaid: "Ü",
};

export const LEAVE_HINT: Record<LeaveType, string> = {
  annual: "Yıllık izin hakkından düşer, ücretli.",
  normal: "Yıllık haktan düşmez. Mazeret / olağan izin.",
  daily: "Tek günlük izin. Yıllık haktan düşmez.",
  report: "Hekim raporu. Rapor no ve kurum yazılabilir; yıllık haktan düşmez.",
  rest: "İstirahat (rapor sonrası veya ayrı). Vardiyadan çıkar, yıllık haktan düşmez.",
  unpaid: "Ücretsiz izin. Ücret ve yıllık hak işlemez.",
};

export const LEAVE_META: Record<LeaveType, { paid: boolean; countsTowardAnnual: boolean }> = {
  annual: { paid: true, countsTowardAnnual: true },
  normal: { paid: true, countsTowardAnnual: false },
  daily: { paid: true, countsTowardAnnual: false },
  report: { paid: true, countsTowardAnnual: false },
  rest: { paid: true, countsTowardAnnual: false },
  unpaid: { paid: false, countsTowardAnnual: false },
};

const LEAVE_PRIORITY: Record<LeaveType, number> = {
  report: 6,
  rest: 5,
  annual: 4,
  unpaid: 3,
  daily: 2,
  normal: 1,
};

export function leaveLength(leave: Pick<LeaveRecord, "startDate" | "endDate">) {
  return isoRange(leave.startDate, leave.endDate).length;
}

export function leaveDaysInYear(leave: Pick<LeaveRecord, "startDate" | "endDate">, year: number) {
  const prefix = String(year);
  return isoRange(leave.startDate, leave.endDate).filter((d) => d.startsWith(prefix)).length;
}

export function annualQuota(employeeDays: number | null | undefined, settingsDays: number) {
  return employeeDays ?? settingsDays;
}

export function usedAnnualDays(
  employeeId: string,
  leaves: LeaveRecord[],
  year: number,
) {
  return leaves
    .filter((l) => l.employeeId === employeeId && (l.type === "annual" || l.countsTowardAnnual))
    .reduce((sum, l) => sum + leaveDaysInYear(l, year), 0);
}

export function leaveOn(
  employeeId: string,
  date: string,
  leaves: LeaveRecord[],
): LeaveRecord | undefined {
  const hits = leaves.filter(
    (l) => l.employeeId === employeeId && date >= l.startDate && date <= l.endDate,
  );
  return [...hits].sort((a, b) => LEAVE_PRIORITY[b.type] - LEAVE_PRIORITY[a.type])[0];
}

export function leavesOverlap(
  employeeId: string,
  start: string,
  end: string,
  leaves: LeaveRecord[],
  exceptId?: string,
) {
  return leaves.some(
    (l) =>
      l.employeeId === employeeId &&
      l.id !== exceptId &&
      l.startDate <= end &&
      l.endDate >= start,
  );
}

export function cellLetter(shift: string, leaveType?: LeaveType) {
  if (shift === "morning") return "S";
  if (shift === "night") return "G";
  if (shift === "off") return "";
  return leaveType ? LEAVE_SHORT[leaveType] : "İ";
}

export const pdfCellMark = cellLetter;
