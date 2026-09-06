import type { AppState, ScheduleResult } from "../types";
import { cellLetter } from "./leaves";
import { fromIso, MONTHS_TR, weekdayMon0 } from "./dates";
import { groupedEmployees, tagsFor } from "./labels";
import { GENDER_LABEL, visibleSignatories } from "./storage";

export function exportPdf(state: AppState, result: ScheduleResult, year: number, month: number) {
  const days = result.days;
  const active = state.employees.filter((e) => e.active);
  const weekdays = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"];
  const gap = new Set(result.maleNightGaps.map((g) => g.date));

  const rows = groupedEmployees(active)
    .map(({ gender, list }) => {
      if (list.length === 0) return "";
      const body = list
        .map((person) => {
          const hours = result.hours.find((h) => h.employeeId === person.id);
          const cells = days
            .map((iso) => {
              const cell = result.cells[`${person.id}|${iso}`];
              const letter = cell ? cellLetter(cell.shift, cell.leaveType) : "";
              const warn = gap.has(iso) && person.gender === "male" && cell?.shift !== "night";
              return `<td style="border:1px solid #d4cbbd;padding:4px;text-align:center;${warn ? "background:#f8e8e4;color:#9b1c1c;font-weight:700;" : ""}">${letter}</td>`;
            })
            .join("");
          const tagText = tagsFor(person, state.tags ?? [])
            .map((t) => t.name)
            .join(", ");
          return `<tr><th style="border:1px solid #d4cbbd;padding:4px 8px;text-align:left;white-space:nowrap;">${escapeHtml(person.name)}<div style="font-size:10px;color:#4a453e;">${GENDER_LABEL[person.gender]}${tagText ? ` · ${escapeHtml(tagText)}` : ""}</div></th>${cells}<td style="border:1px solid #d4cbbd;padding:4px;text-align:center;">${hours?.hours ?? 0}</td></tr>`;
        })
        .join("");
      return `<tr><th colspan="${days.length + 2}" style="background:#ebe4d8;text-align:left;padding:6px 8px;border:1px solid #d4cbbd;">${gender === "male" ? "Erkek bölümü" : "Bayan bölümü"}</th></tr>${body}`;
    })
    .join("");

  const head = days
    .map((iso) => {
      const d = fromIso(iso);
      const empty = gap.has(iso);
      return `<th style="border:1px solid #d4cbbd;padding:4px;background:${empty ? "#9b1c1c" : "#14110e"};color:${empty ? "#fff" : "#f3eee4"};min-width:28px;">${weekdays[weekdayMon0(d)]}<div>${d.getDate()}</div>${empty ? "<div style='font-size:8px'>GECE</div>" : ""}</th>`;
    })
    .join("");

  const morningGaps = result.maleMorningGaps ?? [];
  const warning =
    result.maleNightGaps.length > 0 || morningGaps.length > 0
      ? `<div style="margin:12px 0;padding:10px 12px;border:2px solid #9b1c1c;background:#f8e8e4;color:#9b1c1c;font-size:13px;"><b>Erkek sabah veya gece boş</b> — her vardiyada en az 1 erkek olmalı.${
          morningGaps.length
            ? ` Sabah: ${morningGaps.map((g) => fromIso(g.date).getDate()).join(", ")}.`
            : ""
        }${
          result.maleNightGaps.length
            ? ` Gece: ${result.maleNightGaps.map((g) => fromIso(g.date).getDate()).join(", ")}.`
            : ""
        } ${MONTHS_TR[month]}.</div>`
      : `<div style="margin:12px 0;padding:8px 12px;border:1px solid #1f6b45;background:#e7f3ec;color:#1f6b45;font-size:13px;">Bu ay her sabah ve her gecede en az 1 erkek nöbetçi var.</div>`;

  const signs = visibleSignatories(state.signatories)
    .map(
      (s) =>
        `<div style="flex:1;min-width:160px;text-align:center;padding:0 12px;"><div style="font-weight:700;min-height:18px;">${escapeHtml(s.name.trim()) || "&nbsp;"}</div><div style="font-size:11px;color:#4a453e;margin-top:4px;">${escapeHtml(s.position.trim()) || "Yetkili"}</div><div style="margin-top:28px;border-bottom:1px solid #14110e;height:36px;"></div><div style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#4a453e;margin-top:6px;">İmza</div></div>`,
    )
    .join("");

  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"/><title>${escapeHtml(state.settings.workplaceName)} ${MONTHS_TR[month]} ${year}</title>
    <style>body{font-family:"IBM Plex Sans",system-ui,sans-serif;color:#14110e;padding:24px;} table{border-collapse:collapse;font-size:12px;} @media print { button{display:none} }</style>
    </head><body>
    <button onclick="window.print()" style="margin-bottom:16px;padding:8px 12px;">Yazdır / PDF</button>
    <h1 style="margin:0 0 4px;font-size:22px;">${escapeHtml(state.settings.workplaceName)}</h1>
    <p style="margin:0 0 8px;color:#4a453e;">${MONTHS_TR[month]} ${year} · Sabah ${state.settings.morningStart}–${state.settings.morningEnd} · Gece ${state.settings.nightStart}–${state.settings.nightEnd}</p>
    ${warning}
    <table><thead><tr><th style="background:#14110e;color:#f3eee4;padding:6px 8px;text-align:left;border:1px solid #d4cbbd;">Personel</th>${head}<th style="background:#14110e;color:#f3eee4;padding:6px;border:1px solid #d4cbbd;">Saat</th></tr></thead><tbody>${rows}</tbody></table>
    <div style="margin-top:28px;padding-top:16px;border-top:1px solid #d4cbbd;"><div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#c45c14;font-weight:600;margin-bottom:14px;">Onay</div><div style="display:flex;flex-wrap:wrap;justify-content:space-around;gap:16px 8px;">${signs}</div></div>
    </body></html>`;

  const win = window.open("", "_blank");
  if (!win) throw new Error("Pencere açılamadı");
  win.document.write(html);
  win.document.close();
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
