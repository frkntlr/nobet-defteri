import ExcelJS from "exceljs";
import type { AppState, ScheduleResult } from "../types";
import { cellLetter } from "./leaves";
import { GENDER_LABEL, SHIFT_LABEL, visibleSignatories } from "./storage";
import { fromIso, MONTHS_TR } from "./dates";
import { groupedEmployees, tagsFor } from "./labels";

export async function exportExcel(state: AppState, result: ScheduleResult, year: number, month: number) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Nöbet Defteri";
  const sheet = wb.addWorksheet("Çizelge");
  const title = `${state.settings.workplaceName} — ${MONTHS_TR[month]} ${year}`;
  sheet.addRow([title]);
  sheet.addRow([
    `Sabah ${state.settings.morningStart}–${state.settings.morningEnd} · Gece ${state.settings.nightStart}–${state.settings.nightEnd}`,
  ]);
  const morningGaps = result.maleMorningGaps ?? [];
  if (result.maleNightGaps.length > 0 || morningGaps.length > 0) {
    sheet.addRow([
      `UYARI: Erkek sabah/gece boş. Sabah: ${morningGaps.map((g) => fromIso(g.date).getDate()).join(", ") || "—"}. Gece: ${result.maleNightGaps.map((g) => fromIso(g.date).getDate()).join(", ") || "—"}. Her vardiyada en az 1 erkek olmalıdır.`,
    ]);
  }
  sheet.addRow([]);

  const header = ["Personel", "Bölüm", ...result.days.map((d) => String(fromIso(d).getDate())), "Saat"];
  sheet.addRow(header);

  const active = state.employees.filter((e) => e.active);
  for (const { gender, list } of groupedEmployees(active)) {
    if (list.length === 0) continue;
    sheet.addRow([gender === "male" ? "Erkek bölümü" : "Bayan bölümü"]);
    for (const person of list) {
      const hours = result.hours.find((h) => h.employeeId === person.id);
      const row = [
        tagsFor(person, state.tags ?? []).length
          ? `${person.name} (${tagsFor(person, state.tags ?? [])
              .map((t) => t.name)
              .join(", ")})`
          : person.name,
        GENDER_LABEL[person.gender],
        ...result.days.map((date) => {
          const cell = result.cells[`${person.id}|${date}`];
          return cell ? cellLetter(cell.shift, cell.leaveType) : "";
        }),
        hours?.hours ?? 0,
      ];
      sheet.addRow(row);
    }
  }

  sheet.addRow([]);
  sheet.addRow(["Aylık özet"]);
  sheet.addRow(["Personel", "Nöbet", "Saat", "Yıllık", "Normal", "Günlük", "Rapor", "İstirahat", "Ücretsiz", "Yedek"]);
  for (const row of result.hours.filter((h) => active.some((e) => e.id === h.employeeId))) {
    const person = state.employees.find((e) => e.id === row.employeeId);
    sheet.addRow([
      person?.name ?? "",
      row.workShifts,
      row.hours,
      row.annualDays,
      row.normalDays,
      row.dailyDays,
      row.reportDays,
      row.restDays,
      row.unpaidDays,
      row.fillShifts,
    ]);
  }

  if (result.maleNightGaps.length > 0) {
    sheet.addRow([]);
    sheet.addRow(["Erkek gece boşlukları"]);
    for (const gap of result.maleNightGaps) {
      const d = fromIso(gap.date);
      sheet.addRow([`${d.getDate()} ${MONTHS_TR[d.getMonth()]}`, `${gap.actual}/${gap.needed}`, SHIFT_LABEL.night]);
    }
  }

  sheet.addRow([]);
  sheet.addRow(["Onay"]);
  const signs = visibleSignatories(state.signatories);
  sheet.addRow(signs.map((s) => s.name || "Ad soyad"));
  sheet.addRow(signs.map((s) => s.position || "Pozisyon"));
  sheet.addRow(signs.map(() => "İmza"));

  sheet.columns.forEach((col) => {
    col.width = Math.min(22, Math.max(8, Number(col.width) || 12));
  });
  sheet.getColumn(1).width = 22;

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(buf as ArrayBuffer)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `nobet-defteri-${year}-${String(month + 1).padStart(2, "0")}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
