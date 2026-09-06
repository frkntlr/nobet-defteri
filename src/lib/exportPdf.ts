import type { AppState, ScheduleResult } from "../types";
import { cellLetter, LEAVE_LABEL, LEAVE_SHORT, LEAVE_TYPES } from "./leaves";
import { fromIso, MONTHS_TR, weekdayMon0 } from "./dates";
import { orderedEmployees, tagsFor } from "./labels";
import { visibleSignatories } from "./storage";

export function exportPdf(state: AppState, result: ScheduleResult, year: number, month: number) {
  const days = result.days;
  const people = orderedEmployees(state.employees.filter((e) => e.active));
  const weekdays = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"];
  const signs = visibleSignatories(state.signatories);
  const colW = `${Math.max(2.1, 72 / Math.max(days.length, 1))}%`;

  const head = days
    .map((iso) => {
      const d = fromIso(iso);
      return `<th class="day">${weekdays[weekdayMon0(d)]}<div class="daynum">${d.getDate()}</div></th>`;
    })
    .join("");

  const rows = people
    .map((person) => {
      const hours = result.hours.find((h) => h.employeeId === person.id);
      const tags = tagsFor(person, state.tags ?? [])
        .map((t) => t.name)
        .join(", ");
      const cells = days
        .map((iso) => {
          const cell = result.cells[`${person.id}|${iso}`];
          const letter = cell ? cellLetter(cell.shift, cell.leaveType) : "";
          const leave = cell?.shift === "leave";
          return `<td class="${leave ? "leave" : ""}">${letter || "&nbsp;"}</td>`;
        })
        .join("");
      return `<tr>
        <th class="name">${escapeHtml(person.name)}${tags ? `<div class="tag">${escapeHtml(tags)}</div>` : ""}</th>
        ${cells}
        <td class="hours">${hours?.hours ?? 0}</td>
      </tr>`;
    })
    .join("");

  const legend = [
    "S Sabah",
    "G Gece",
    ...LEAVE_TYPES.map((t) => `${LEAVE_SHORT[t]} ${LEAVE_LABEL[t]}`),
    "boş Off",
  ].join(" · ");

  const signCols = signs
    .map(
      (s) => `<td class="sign">
        <div class="sign-name">${escapeHtml(s.name.trim()) || "&nbsp;"}</div>
        <div class="sign-role">${escapeHtml(s.position.trim()) || "Yetkili"}</div>
        <div class="sign-line"></div>
        <div class="sign-label">İmza</div>
      </td>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(state.settings.workplaceName)} ${MONTHS_TR[month]} ${year}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; background: #fff; color: #000; }
    body { font-family: "IBM Plex Sans", "Liberation Sans", Arial, sans-serif; padding: 14px 16px 20px; }
    h1 { margin: 0 0 2px; font-size: 20px; font-weight: 700; color: #000; }
    .meta { margin: 0 0 10px; font-size: 12px; color: #000; }
    table.grid { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 11px; }
    table.grid th, table.grid td {
      border: 1px solid #000;
      background: #fff;
      color: #000;
      text-align: center;
      padding: 3px 2px;
      width: ${colW};
    }
    table.grid th.name, table.grid td.hours { width: 13%; }
    table.grid thead th { background: #fff; color: #000; font-weight: 700; }
    .day { font-size: 10px; font-weight: 600; }
    .daynum { font-size: 17px; font-weight: 800; line-height: 1.15; margin-top: 1px; }
    .name { text-align: left !important; font-size: 14px; font-weight: 800; padding: 4px 6px !important; }
    .tag { font-size: 9px; font-weight: 500; margin-top: 1px; }
    .hours { font-weight: 700; }
    td.leave { font-weight: 800; font-size: 12px; }
    .legend { margin: 10px 0 0; font-size: 11px; color: #000; }
    table.signs { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 28px; }
    table.signs td.sign {
      border: none;
      vertical-align: top;
      text-align: center;
      padding: 0 10px;
    }
    .sign-name { font-weight: 800; font-size: 13px; min-height: 18px; color: #000; }
    .sign-role { font-size: 11px; margin-top: 3px; color: #000; }
    .sign-line { height: 42px; border-bottom: 1px solid #000; margin: 18px 8px 0; }
    .sign-label { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; margin-top: 5px; color: #000; }
    button.print { margin-bottom: 12px; padding: 8px 12px; background: #fff; color: #000; border: 1px solid #000; }
    @page { size: A4 landscape; margin: 8mm; }
    @media print {
      button.print { display: none; }
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <button class="print" onclick="window.print()">Yazdır / PDF</button>
  <h1>${escapeHtml(state.settings.workplaceName)}</h1>
  <p class="meta">${MONTHS_TR[month]} ${year} · Sabah ${state.settings.morningStart}–${state.settings.morningEnd} · Gece ${state.settings.nightStart}–${state.settings.nightEnd}</p>
  <table class="grid">
    <thead>
      <tr>
        <th class="name">Personel</th>
        ${head}
        <th class="hours">Saat</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="legend">${escapeHtml(legend)}</p>
  ${
    signs.length
      ? `<table class="signs"><tr>${signCols}</tr></table>`
      : ""
  }
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) throw new Error("Pencere açılamadı");
  win.document.write(html);
  win.document.close();
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
