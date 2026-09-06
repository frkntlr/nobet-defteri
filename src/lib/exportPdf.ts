import type { AppState, ScheduleResult } from "../types";
import { cellLetter, LEAVE_LABEL, LEAVE_SHORT, LEAVE_TYPES } from "./leaves";
import { fromIso, isWeekend, MONTHS_TR, WEEKDAYS_TR, weekdayMon0 } from "./dates";
import { orderedEmployees, tagsFor } from "./labels";
import { visibleSignatories } from "./storage";

export function exportPdf(state: AppState, result: ScheduleResult, year: number, month: number) {
  const days = result.days;
  const people = orderedEmployees(state.employees.filter((e) => e.active));
  const signs = visibleSignatories(state.signatories);

  const head = days
    .map((iso) => {
      const d = fromIso(iso);
      const weekend = isWeekend(d);
      return `<th class="day${weekend ? " weekend" : ""}"><span class="wd">${WEEKDAYS_TR[weekdayMon0(d)]}</span><span class="daynum">${d.getDate()}</span></th>`;
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
          const mark = cell ? cellLetter(cell.shift, cell.leaveType) : "";
          const weekend = isWeekend(fromIso(iso));
          const leave = cell?.shift === "leave";
          const cls = [weekend ? "weekend" : "", leave ? "leave" : ""].filter(Boolean).join(" ");
          return `<td class="${cls}">${mark ? escapeHtml(mark) : ""}</td>`;
        })
        .join("");
      return `<tr>
        <th class="name">${escapeHtml(person.name)}${tags ? `<div class="tag">${escapeHtml(tags)}</div>` : ""}</th>
        ${cells}
        <td class="hours">${hours?.hours ?? 0}</td>
      </tr>`;
    })
    .join("");

  const legend = ["S Sabah", "G Gece", ...LEAVE_TYPES.map((t) => `${LEAVE_SHORT[t]} ${LEAVE_LABEL[t]}`), "boş tatil", "Cmt Cumartesi", "Paz Pazar"].join(
    " · ",
  );

  const signCols = signs
    .map(
      (s) => `<td class="sign">
        <div class="sign-name">${escapeHtml(s.name.trim()) || "&nbsp;"}</div>
        <div class="sign-role">${escapeHtml(s.position.trim()) || "Yetkili"}</div>
        <div class="sign-gap"></div>
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
    body { font-family: "Liberation Sans", Arial, Helvetica, sans-serif; padding: 8px 10px 12px; }
    h1 { margin: 0; font-size: 15px; font-weight: 700; }
    .meta { margin: 2px 0 8px; font-size: 10px; }
    table.grid {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 10px;
    }
    table.grid th, table.grid td {
      border: 1px solid #000;
      background: #fff;
      color: #000;
      text-align: center;
      padding: 2px 1px;
      vertical-align: middle;
    }
    table.grid th.name { width: 118px; text-align: left; font-size: 11px; font-weight: 700; padding: 3px 5px; }
    table.grid td.hours, table.grid th.hours { width: 36px; font-weight: 700; }
    .day { font-size: 8px; font-weight: 700; }
    .wd { display: block; letter-spacing: 0.02em; }
    .daynum { display: block; font-size: 13px; font-weight: 800; line-height: 1.1; margin-top: 1px; }
    .tag { font-size: 8px; font-weight: 500; margin-top: 1px; }
    td.leave { font-weight: 700; }
    th.weekend, td.weekend { background: #e6e6e6 !important; }
    .legend { margin: 6px 0 0; font-size: 9px; }
    table.signs { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 18px; }
    table.signs td.sign {
      border: none;
      text-align: center;
      vertical-align: top;
      padding: 0 8px;
    }
    .sign-name { font-weight: 700; font-size: 11px; min-height: 14px; }
    .sign-role { font-size: 9px; margin-top: 2px; min-height: 12px; }
    .sign-gap { height: 28px; }
    .sign-line { border-bottom: 1px solid #000; margin: 0 6px; }
    .sign-label { font-size: 8px; letter-spacing: 0.12em; text-transform: uppercase; margin-top: 3px; }
    button.print { margin-bottom: 8px; padding: 6px 10px; background: #fff; color: #000; border: 1px solid #000; }
    @page { size: A4 landscape; margin: 6mm; }
    @media print {
      button.print { display: none; }
      body { padding: 0; }
      table.grid, table.signs { page-break-inside: avoid; }
      th.weekend, td.weekend { background: #e6e6e6 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
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
  ${signs.length ? `<table class="signs"><tr>${signCols}</tr></table>` : ""}
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
