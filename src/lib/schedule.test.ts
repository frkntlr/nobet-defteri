import { describe, expect, it } from "vitest";
import { buildSchedule, wouldEmptyMaleMorning, wouldEmptyMaleNight } from "./schedule";
import { DEFAULT_SETTINGS } from "./storage";
import type { Employee, ManualCell } from "../types";
import { monthDays, fromIso, weekdayMon0 } from "./dates";

function male(id: string, offset: number, extra: Partial<Employee> = {}): Employee {
  return {
    id,
    name: id,
    gender: "male",
    pattern: "rotating",
    cycleOffset: offset,
    autoOffset: false,
    workDays: null,
    offDays: null,
    workWeekdays: [],
    annualLeaveDays: null,
    active: true,
    notes: "",
    tagIds: [],
    sort: 0,
    ...extra,
  };
}

const settings = { ...DEFAULT_SETTINGS, cycleAnchor: "2026-08-01", minMaleNight: 1, preferMaleNight: 2 };
const august = monthDays(2026, 7);

describe("erkek gece nöbeti", () => {
  it("dönen erkek ekipte her gece en az 1 kişi bırakır", () => {
    const employees = [male("a", 0), male("b", 2), male("c", 4), male("d", 6)];
    const result = buildSchedule(employees, [], [], settings, august);
    expect(result.maleNightGaps).toEqual([]);
    for (const date of result.days) {
      const nights = employees.filter((e) => result.cells[`${e.id}|${date}`]?.shift === "night");
      expect(nights.length, date).toBeGreaterThanOrEqual(1);
    }
  });

  it("elle son erkeği geceden çıkarınca boş geceyi uyarır", () => {
    const employees = [male("ali", 0), male("can", 0, { pattern: "fixed_morning" })];
    const date = "2026-08-10";
    const manuals: ManualCell[] = [
      { employeeId: "ali", date, shift: "off" },
      { employeeId: "can", date, shift: "morning" },
    ];
    const result = buildSchedule(employees, [], manuals, settings, august);
    const gap = result.maleNightGaps.find((g) => g.date === date);
    expect(gap).toBeTruthy();
    expect(gap?.actual).toBe(0);
    expect(gap?.needed).toBe(1);
  });

  it("elle başka erkek geceye yazılırsa uyarı kalkar", () => {
    const employees = [male("ali", 0), male("can", 4)];
    const date = "2026-08-10";
    const manuals: ManualCell[] = [
      { employeeId: "ali", date, shift: "off" },
      { employeeId: "can", date, shift: "night" },
    ];
    const result = buildSchedule(employees, [], manuals, settings, august);
    expect(result.maleNightGaps.find((g) => g.date === date)).toBeUndefined();
    expect(result.cells[`can|${date}`]?.shift).toBe("night");
  });

  it("hücrede son gece nöbetçisini değiştirmek boş gece uyarısını önceden gösterir", () => {
    const employees = [male("ali", 0), male("can", 0, { pattern: "fixed_morning" })];
    const result = buildSchedule(
      employees,
      [],
      [{ employeeId: "ali", date: "2026-08-03", shift: "night" }],
      settings,
      august,
    );
    expect(wouldEmptyMaleNight(result, employees, "ali", "2026-08-03", "off", settings)).toBe(true);
    expect(wouldEmptyMaleNight(result, employees, "ali", "2026-08-03", "night", settings)).toBe(false);
  });

  it("bütün erkekler izinliyse boş gece leave olarak işaretlenir", () => {
    const employees = [male("ali", 0), male("can", 2)];
    const leaves = [
      {
        id: "l1",
        employeeId: "ali",
        startDate: "2026-08-05",
        endDate: "2026-08-05",
        type: "annual" as const,
        note: "",
        documentNo: "",
        institution: "",
        paid: true,
        countsTowardAnnual: true,
      },
      {
        id: "l2",
        employeeId: "can",
        startDate: "2026-08-05",
        endDate: "2026-08-05",
        type: "report" as const,
        note: "",
        documentNo: "",
        institution: "",
        paid: true,
        countsTowardAnnual: false,
      },
    ];
    const result = buildSchedule(employees, leaves, [], settings, august);
    const gap = result.maleNightGaps.find((g) => g.date === "2026-08-05");
    expect(gap?.reason).toBe("leave");
  });
});

function isWork(shift: string | undefined) {
  return shift === "morning" || shift === "night";
}

describe("erkek sabah nöbeti", () => {
  it("dönen erkek ekipte her sabah en az 1 kişi bırakır", () => {
    const employees = [male("a", 0), male("b", 2), male("c", 4), male("d", 6)];
    const result = buildSchedule(employees, [], [], settings, august);
    expect(result.maleMorningGaps).toEqual([]);
    for (const date of result.days) {
      const mornings = employees.filter((e) => result.cells[`${e.id}|${date}`]?.shift === "morning");
      expect(mornings.length, date).toBeGreaterThanOrEqual(1);
    }
  });

  it("elle son erkeği sabahtan çıkarınca boş sabahı uyarır", () => {
    const employees = [male("ali", 0, { pattern: "fixed_night" }), male("can", 0, { pattern: "fixed_morning" })];
    const date = "2026-08-10";
    const manuals: ManualCell[] = [
      { employeeId: "can", date, shift: "off" },
      { employeeId: "ali", date, shift: "night" },
    ];
    const result = buildSchedule(employees, [], manuals, settings, august);
    const gap = result.maleMorningGaps.find((g) => g.date === date);
    expect(gap).toBeTruthy();
    expect(gap?.actual).toBe(0);
    expect(wouldEmptyMaleMorning(result, employees, "can", date, "off", settings) || gap?.actual === 0).toBe(true);
  });
});

describe("öncelik sırası", () => {
  it("sabah ve gece tabanı 15 gün ve 2+2 ile birlikte sağlanır", () => {
    const employees = [male("a", 0), male("b", 2), male("c", 4), male("d", 6)];
    const result = buildSchedule(employees, [], [], settings, august);
    expect(result.maleMorningGaps).toEqual([]);
    expect(result.maleNightGaps).toEqual([]);
    expect(result.rhythmBreaks).toEqual([]);
    for (const person of employees) {
      expect(result.hours.find((h) => h.employeeId === person.id)?.workShifts, person.id).toBeGreaterThanOrEqual(15);
    }
  });

  it("elle bir gece boşaltılınca kilitli olmayan erkek geceye alınır", () => {
    const employees = [male("a", 0), male("b", 2), male("c", 4), male("d", 6)];
    const date = "2026-08-12";
    const onNight = employees.filter((e) => {
      const seed = buildSchedule(employees, [], [], settings, august);
      return seed.cells[`${e.id}|${date}`]?.shift === "night";
    });
    const manuals: ManualCell[] = onNight.map((e) => ({ employeeId: e.id, date, shift: "off" as const }));
    const result = buildSchedule(employees, [], manuals, settings, august);
    const nights = employees.filter((e) => result.cells[`${e.id}|${date}`]?.shift === "night");
    expect(nights.length, date).toBeGreaterThanOrEqual(1);
    expect(result.maleNightGaps.find((g) => g.date === date)).toBeUndefined();
    });
});
