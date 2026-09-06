import { describe, expect, it } from "vitest";
import { fromIso, isWeekend, WEEKDAYS_TR, weekdayMon0 } from "./dates";
import { cellLetter, LEAVE_SHORT, pdfCellMark } from "./leaves";

describe("hafta sonu", () => {
  it("Cumartesi ve Pazarı gri sütun için işaretler", () => {
    expect(isWeekend(fromIso("2026-09-05"))).toBe(true);
    expect(isWeekend(fromIso("2026-09-06"))).toBe(true);
    expect(WEEKDAYS_TR[weekdayMon0(fromIso("2026-09-05"))]).toBe("Cmt");
    expect(WEEKDAYS_TR[weekdayMon0(fromIso("2026-09-06"))]).toBe("Paz");
    expect(isWeekend(fromIso("2026-09-04"))).toBe(false);
  });
});

describe("çizelge ve PDF işaretleri", () => {
  it("aynı kısaltmaları kullanır", () => {
    expect(cellLetter("morning")).toBe("S");
    expect(cellLetter("night")).toBe("G");
    expect(cellLetter("off")).toBe("");
    expect(cellLetter("leave", "annual")).toBe(LEAVE_SHORT.annual);
    expect(cellLetter("leave", "report")).toBe(LEAVE_SHORT.report);
    expect(pdfCellMark("morning")).toBe(cellLetter("morning"));
    expect(pdfCellMark("leave", "annual")).toBe(cellLetter("leave", "annual"));
    expect(pdfCellMark("leave", "report")).toBe(cellLetter("leave", "report"));
    expect(pdfCellMark("off")).toBe("");
  });
});
