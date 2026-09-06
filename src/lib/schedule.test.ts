import { describe, expect, it } from "vitest";
import { buildSchedule, wouldEmptyMaleNight } from "./schedule";
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

describe("2 iş / 2 off ve 15 gün", () => {
  it("dönen ekipte 3 gün üst üste iş veya 1 gün off bırakmaz", () => {
    const employees = [male("a", 0), male("b", 2), male("c", 4), male("d", 6)];
    const result = buildSchedule(employees, [], [], settings, august);
    expect(result.rhythmBreaks).toEqual([]);
    for (const person of employees) {
      const hours = result.hours.find((h) => h.employeeId === person.id);
      expect(hours?.workShifts, person.id).toBeGreaterThanOrEqual(15);
      let run = 0;
      for (const date of result.days) {
        if (isWork(result.cells[`${person.id}|${date}`]?.shift)) {
          run += 1;
          expect(run, `${person.id} ${date}`).toBeLessThanOrEqual(2);
        } else {
          run = 0;
        }
      }
    }
  });

  it("elle bir iş gününü off yazınca kilitli olmayan günlerde 2+2 korunur", () => {
    const employees = [male("a", 0), male("b", 2), male("c", 4), male("d", 6)];
    const result = buildSchedule(employees, [], [{ employeeId: "a", date: "2026-08-01", shift: "off" }], settings, august);
    const unlockedBreaks = result.rhythmBreaks.filter((b) => result.cells[`${b.employeeId}|${b.date}`]?.source !== "manual");
    expect(unlockedBreaks).toEqual([]);
  });

  it("elle çiftin ilk gününü off yazınca kalan tek iş günü kapanır", () => {
    const employees = [male("a", 0), male("b", 2), male("c", 4), male("d", 6)];
    const result = buildSchedule(employees, [], [{ employeeId: "a", date: "2026-08-05", shift: "off" }], settings, august);
    const around = ["2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08"].map((d) => ({
      d,
      shift: result.cells[`a|${d}`]?.shift,
      source: result.cells[`a|${d}`]?.source,
    }));
    expect(result.cells["a|2026-08-05"]?.shift).toBe("off");
    const sixth = result.cells["a|2026-08-06"];
    const paired = isWork(sixth?.shift) && isWork(result.cells["a|2026-08-07"]?.shift);
    expect(isWork(sixth?.shift) && !paired, JSON.stringify(around)).toBe(false);
    const unlockedBreaks = result.rhythmBreaks.filter((b) => result.cells[`${b.employeeId}|${b.date}`]?.source !== "manual");
    expect(unlockedBreaks).toEqual([]);
  });
});

describe("seçili günler sabahçı", () => {
  it("yalnızca seçilen hafta günlerinde sabah yazar, gece yazmaz", () => {
    const person = male("veli", 0, { pattern: "selected_morning", workWeekdays: [0, 2, 4], autoOffset: false });
    const result = buildSchedule([person, male("a", 0), male("b", 4)], [], [], settings, august);
    for (const date of result.days) {
      const cell = result.cells[`veli|${date}`];
      const weekday = weekdayMon0(fromIso(date));
      if (cell?.source === "manual" || cell?.source === "leave") continue;
      if ([0, 2, 4].includes(weekday)) {
        expect(cell?.shift, date).toBe("morning");
      } else {
        expect(cell?.shift, date).not.toBe("morning");
        expect(cell?.shift, date).not.toBe("night");
      }
    }
  });

  it("özel iş ritmi (2+2) açıkken de seçilen sabah günlerini yazar", () => {
    const person = male("veli", 0, {
      pattern: "selected_morning",
      workWeekdays: [0, 2, 4],
      workDays: 2,
      offDays: 2,
      autoOffset: false,
    });
    const result = buildSchedule([person, male("a", 0), male("b", 4)], [], [], settings, august);
    const selectedMornings = result.days.filter((date) => {
      const weekday = weekdayMon0(fromIso(date));
      return [0, 2, 4].includes(weekday) && result.cells[`veli|${date}`]?.shift === "morning";
    });
    const selectedDates = result.days.filter((date) => [0, 2, 4].includes(weekdayMon0(fromIso(date))));
    expect(selectedMornings.length).toBe(selectedDates.length);
    expect(selectedMornings.length).toBeGreaterThan(0);
  });

  it("örnek ekip + özel ritim + eylülde her seçili gün sabah kalır", () => {
    const september = monthDays(2026, 8);
    const team = [
      male("ahmet", 0),
      male("mehmet", 2),
      male("can", 4),
      male("hasan", 0, { pattern: "fixed_night" }),
      male("elif", 6, { gender: "female", pattern: "rotating" }),
      male("ayse", 0, { gender: "female", pattern: "fixed_morning", workWeekdays: [0, 2, 4], workDays: 2, offDays: 2 }),
      male("sabah", 0, {
        pattern: "selected_morning",
        workWeekdays: [0, 2, 4],
        workDays: 2,
        offDays: 2,
        autoOffset: false,
      }),
    ];
    const result = buildSchedule(team, [], [], settings, september);
    for (const id of ["sabah", "ayse"]) {
      for (const date of result.days) {
        const cell = result.cells[`${id}|${date}`];
        const weekday = weekdayMon0(fromIso(date));
        if ([0, 2, 4].includes(weekday)) {
          expect(cell?.shift, `${id} ${date}`).toBe("morning");
        } else {
          expect(cell?.shift, `${id} ${date}`).not.toBe("morning");
        }
      }
    }
  });

  it("sabahçıda işaretlenen günler 2+2 ritim yüzünden silinmez", () => {
    const person = male("ayse", 0, {
      pattern: "fixed_morning",
      workWeekdays: [0, 2, 4],
      workDays: 2,
      offDays: 2,
      autoOffset: false,
    });
    const result = buildSchedule([person, male("a", 0), male("b", 4)], [], [], settings, august);
    for (const date of result.days) {
      const cell = result.cells[`ayse|${date}`];
      const weekday = weekdayMon0(fromIso(date));
      if (cell?.source === "manual" || cell?.source === "leave") continue;
      if ([0, 2, 4].includes(weekday)) {
        expect(cell?.shift, date).toBe("morning");
      } else {
        expect(cell?.shift, date).not.toBe("morning");
      }
    }
  });
});
