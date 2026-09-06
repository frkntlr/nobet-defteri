import type { Holiday, IsoDate } from "../types";
import { uid } from "./cn";
import { isoRange } from "./dates";

type YearHolidays = {
  ramadanEve: IsoDate;
  ramadan: [IsoDate, IsoDate];
  sacrificeEve: IsoDate;
  sacrifice: [IsoDate, IsoDate];
};

const RELIGIOUS: Record<number, YearHolidays> = {
  2025: {
    ramadanEve: "2025-03-29",
    ramadan: ["2025-03-30", "2025-04-01"],
    sacrificeEve: "2025-06-05",
    sacrifice: ["2025-06-06", "2025-06-09"],
  },
  2026: {
    ramadanEve: "2026-03-19",
    ramadan: ["2026-03-20", "2026-03-22"],
    sacrificeEve: "2026-05-26",
    sacrifice: ["2026-05-27", "2026-05-30"],
  },
  2027: {
    ramadanEve: "2027-03-08",
    ramadan: ["2027-03-09", "2027-03-11"],
    sacrificeEve: "2027-05-15",
    sacrifice: ["2027-05-16", "2027-05-19"],
  },
  2028: {
    ramadanEve: "2028-02-26",
    ramadan: ["2028-02-27", "2028-02-29"],
    sacrificeEve: "2028-05-04",
    sacrifice: ["2028-05-05", "2028-05-08"],
  },
};

function holiday(
  date: IsoDate,
  name: string,
  kind: Holiday["kind"],
  halfDay = false,
): Holiday {
  return { id: uid(), date, name, kind, halfDay };
}

export function officialHolidays(year: number): Holiday[] {
  const y = String(year).padStart(4, "0");
  const list: Holiday[] = [
    holiday(`${y}-01-01`, "Yılbaşı", "national"),
    holiday(`${y}-04-23`, "Ulusal Egemenlik ve Çocuk Bayramı", "national"),
    holiday(`${y}-05-01`, "Emek ve Dayanışma Günü", "national"),
    holiday(`${y}-05-19`, "Atatürk'ü Anma, Gençlik ve Spor Bayramı", "national"),
    holiday(`${y}-07-15`, "Demokrasi ve Millî Birlik Günü", "national"),
    holiday(`${y}-08-30`, "Zafer Bayramı", "national"),
    holiday(`${y}-10-28`, "Cumhuriyet Bayramı arifesi", "eve", true),
    holiday(`${y}-10-29`, "Cumhuriyet Bayramı", "national"),
  ];
  const extra = RELIGIOUS[year];
  if (extra) {
    list.push(holiday(extra.ramadanEve, "Ramazan Bayramı arifesi", "eve", true));
    isoRange(extra.ramadan[0], extra.ramadan[1]).forEach((date, i) => {
      list.push(holiday(date, `Ramazan Bayramı ${i + 1}. gün`, "religious"));
    });
    list.push(holiday(extra.sacrificeEve, "Kurban Bayramı arifesi", "eve", true));
    isoRange(extra.sacrifice[0], extra.sacrifice[1]).forEach((date, i) => {
      list.push(holiday(date, `Kurban Bayramı ${i + 1}. gün`, "religious"));
    });
  }
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

export function mergeHolidays(existing: Holiday[], year: number): Holiday[] {
  const generated = officialHolidays(year);
  const seen = new Set(existing.map((h) => h.date));
  const extra = generated.filter((h) => !seen.has(h.date));
  return [...existing, ...extra].sort(
    (a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "tr"),
  );
}

export function holidayOn(date: IsoDate, holidays: Holiday[]) {
  return holidays.find((h) => h.date === date);
}

export const HOLIDAY_KIND_LABEL: Record<Holiday["kind"], string> = {
  national: "Ulusal",
  religious: "Dini bayram",
  eve: "Arefe (yarım gün)",
  custom: "Özel",
};
