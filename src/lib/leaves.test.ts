import { describe, expect, it } from "vitest";
import { cellLetter, pdfCellMark } from "./leaves";

describe("PDF hücre işaretleri", () => {
  it("nöbet gününü boş bırakır, çizgi yazmaz", () => {
    expect(cellLetter("off")).toBe("");
    expect(pdfCellMark("off")).toBe("");
  });

  it("izin ve raporu okunaklı yazar", () => {
    expect(pdfCellMark("leave", "annual")).toBe("Yıllık");
    expect(pdfCellMark("leave", "report")).toBe("Rapor");
    expect(pdfCellMark("leave", "normal")).toBe("İzin");
    expect(pdfCellMark("morning")).toBe("S");
    expect(pdfCellMark("night")).toBe("G");
  });
});
