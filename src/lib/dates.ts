import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
} from "date-fns";
import { tr } from "date-fns/locale";
import type { IsoDate } from "../types";

export const MONTHS_TR = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
] as const;

export const WEEKDAYS_TR = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"] as const;

export function toIso(date: Date): IsoDate {
  return format(date, "yyyy-MM-dd");
}

export function fromIso(iso: IsoDate): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

export function monthDays(year: number, monthIndex: number): Date[] {
  const start = startOfDay(new Date(year, monthIndex, 1));
  return eachDayOfInterval({ start, end: endOfMonth(start) });
}

export function weekdayMon0(date: Date) {
  return (date.getDay() + 6) % 7;
}

export function daysBetween(date: Date, anchorIso: IsoDate) {
  return differenceInCalendarDays(date, fromIso(anchorIso));
}

export function formatLong(date: Date) {
  return format(date, "d MMMM yyyy, EEEE", { locale: tr });
}

export function dayNumber(date: Date) {
  return format(date, "d");
}

export function isoRange(start: IsoDate, end: IsoDate): IsoDate[] {
  const a = fromIso(start);
  const b = fromIso(end);
  if (b < a) return [];
  return eachDayOfInterval({ start: a, end: b }).map(toIso);
}

export function shiftIso(iso: IsoDate, days: number): IsoDate {
  return toIso(addDays(fromIso(iso), days));
}

export function monthLabel(year: number, monthIndex: number) {
  return `${MONTHS_TR[monthIndex]} ${year}`;
}

export function currentMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

export function startOfMonthIso(year: number, monthIndex: number): IsoDate {
  return toIso(startOfMonth(new Date(year, monthIndex, 1)));
}
