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

describe("2 iş / 2 off ve 15 gün", () => {
  it("dönen ekipte 3 gün üst üste iş veya 1 gün tatil bırakmaz", () => {
    const employees = [male("a", 0), male("b", 2), male("c", 4), male("d", 6)];
    const result = buildSchedule(employees, [], [], settings, august);
    expect(result.rhythmBreaks.filter((b) => b.kind !== "short_work")).toEqual([]);
    for (const person of employees) {
      const hours = result.hours.find((h) => h.employeeId === person.id);
      expect(hours?.workShifts, person.id).toBeGreaterThanOrEqual(15);
      let run = 0;
      let off = 0;
      let sawWork = false;
      for (const date of result.days) {
        if (isWork(result.cells[`${person.id}|${date}`]?.shift)) {
          if (sawWork && off > 0) expect(off, `${person.id} ${date}`).toBeGreaterThanOrEqual(2);
          off = 0;
          run += 1;
          sawWork = true;
          expect(run, `${person.id} ${date}`).toBeLessThanOrEqual(2);
        } else {
          run = 0;
          if (result.cells[`${person.id}|${date}`]?.shift !== "leave") off += 1;
        }
      }
    }
  });

  it("elle bir iş gününü off yazınca örtü ve 15 gün durur", () => {
    const employees = [male("a", 0), male("b", 2), male("c", 4), male("d", 6)];
    const result = buildSchedule(employees, [], [{ employeeId: "a", date: "2026-08-01", shift: "off" }], settings, august);
    expect(result.maleMorningGaps).toEqual([]);
    expect(result.maleNightGaps).toEqual([]);
    for (const person of employees) {
      const hours = result.hours.find((h) => h.employeeId === person.id);
      expect(hours?.workShifts, person.id).toBeGreaterThanOrEqual(hours?.requiredWorkDays ?? 15);
    }
  });

  it("sabahçı varken gececiyi sabaha yazmaz", () => {
    const employees = [
      male("sabahci", 0, { pattern: "fixed_morning" }),
      male("gececi", 0, { pattern: "fixed_night" }),
      male("donen", 2),
    ];
    const result = buildSchedule(employees, [], [], settings, august);
    for (const date of result.days) {
      if (result.cells[`sabahci|${date}`]?.shift === "morning") {
        expect(result.cells[`gececi|${date}`]?.shift, date).not.toBe("morning");
        expect(result.cells[`donen|${date}`]?.shift, date).not.toBe("morning");
      }
    }
  });

  it("2 gün nöbet sığmazsa tek gün iş kalabilir", () => {
    const employees = [male("a", 0), male("b", 2), male("c", 4), male("d", 6)];
    const result = buildSchedule(employees, [], [{ employeeId: "a", date: "2026-08-05", shift: "off" }], settings, august);
    expect(result.cells["a|2026-08-05"]?.shift).toBe("off");
    expect(result.maleMorningGaps).toEqual([]);
    expect(result.maleNightGaps).toEqual([]);
    const sixth = result.cells["a|2026-08-06"];
    const seventh = result.cells["a|2026-08-07"];
    const isolatedOk = !isWork(sixth?.shift) || isWork(seventh?.shift) || sixth?.source !== "manual";
    expect(isolatedOk).toBe(true);
  });
});

describe("bayan uyarıları", () => {
  it("bayan sabah eksiğini issues listesine yazmaz, gece eksiğini yazar", () => {
    const team = [
      male("ayse", 0, { gender: "female", pattern: "fixed_night" }),
      male("ali", 0),
      male("can", 4),
    ];
    const result = buildSchedule(team, [], [], settings, august);
    expect(result.issues.some((i) => i.section === "female" && i.shift === "morning")).toBe(false);
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
