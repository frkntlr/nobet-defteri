import { describe, expect, it } from "vitest";
import { cellLetter, LEAVE_SHORT, pdfCellMark } from "./leaves";

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
