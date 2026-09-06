import type { AppState, ScheduleResult } from "../types";
import { LEAVE_LABEL, LEAVE_TYPES, pdfCellMark } from "./leaves";
import { fromIso, MONTHS_TR, weekdayMon0 } from "./dates";
import { orderedEmployees, tagsFor } from "./labels";
import { visibleSignatories } from "./storage";

export function exportPdf(state: AppState, result: ScheduleResult, year: number, month: number) {
  const days = result.days;
  const people = orderedEmployees(state.employees.filter((e) => e.active));
  const weekdays = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"];
  const signs = visibleSignatories(state.signatories);
  const colW = `${Math.max(2.0, 70 / Math.max(days.length, 1))}%`;

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
          const mark = cell ? pdfCellMark(cell.shift, cell.leaveType) : "";
          const leave = cell?.shift === "leave";
          const work = cell?.shift === "morning" || cell?.shift === "night";
          const cls = leave ? "leave" : work ? "work" : "off";
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

  const legend = ["S Sabah", "G Gece", ...LEAVE_TYPES.map((t) => `${pdfCellMark("leave", t)} ${LEAVE_LABEL[t]}`), "boş tatil"].join(
    " · ",
  );

  const signBlock = signs.length
    ? `<div class="signs" style="grid-template-columns: repeat(${signs.length}, minmax(0, 1fr));">${signs
        .map(
          (s) => `<div class="sign">
        <div class="sign-head">
          <div class="sign-name">${escapeHtml(s.name.trim()) || "&nbsp;"}</div>
          <div class="sign-role">${escapeHtml(s.position.trim()) || "Yetkili"}</div>
        </div>
        <div class="sign-space"></div>
        <div class="sign-line"></div>
        <div class="sign-label">İmza</div>
      </div>`,
        )
        .join("")}</div>`
    : "";

  const html = `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(state.settings.workplaceName)} ${MONTHS_TR[month]} ${year}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; background: #fff; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: "IBM Plex Sans", "Liberation Sans", Arial, sans-serif; padding: 12px 14px 18px; }
    h1 { margin: 0 0 2px; font-size: 20px; font-weight: 800; color: #000; }
    .meta { margin: 0 0 8px; font-size: 12px; color: #000; }
    table.grid { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 11px; }
    table.grid th, table.grid td {
      border: 1px solid #000;
      background: #fff;
      color: #000;
      text-align: center;
      padding: 2px 1px;
      width: ${colW};
      vertical-align: middle;
    }
    table.grid th.name, table.grid td.hours { width: 16%; }
    table.grid thead th { background: #fff; color: #000; font-weight: 700; }
    .day { font-size: 10px; font-weight: 600; padding: 4px 1px !important; }
    .daynum { font-size: 22px; font-weight: 800; line-height: 1.05; margin-top: 2px; letter-spacing: -0.03em; }
    .name { text-align: left !important; font-size: 16px; font-weight: 800; padding: 5px 7px !important; line-height: 1.15; }
    .tag { font-size: 9px; font-weight: 500; margin-top: 2px; }
    .hours { font-weight: 700; font-size: 13px; }
    td.work { font-size: 13px; font-weight: 800; }
    td.leave { font-weight: 800; font-size: 10px; letter-spacing: -0.02em; }
    td.off { color: #000; }
    .legend { margin: 8px 0 0; font-size: 11px; color: #000; }
    .signs {
      display: grid;
      width: 100%;
      margin-top: 26px;
      column-gap: 16px;
      align-items: stretch;
    }
    .sign {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      min-width: 0;
      min-height: 118px;
    }
    .sign-head { width: 100%; min-height: 40px; }
    .sign-name { font-weight: 800; font-size: 13px; line-height: 1.2; min-height: 16px; word-break: break-word; }
    .sign-role { font-size: 11px; margin-top: 3px; line-height: 1.2; min-height: 14px; }
    .sign-space { flex: 1 1 auto; min-height: 34px; width: 100%; }
    .sign-line { width: 86%; border-bottom: 1px solid #000; height: 0; }
    .sign-label { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; margin-top: 5px; }
    button.print { margin-bottom: 10px; padding: 8px 12px; background: #fff; color: #000; border: 1px solid #000; }
    @page { size: A4 landscape; margin: 7mm; }
    @media print {
      button.print { display: none; }
      body { padding: 0; }
      .signs { break-inside: avoid; page-break-inside: avoid; }
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
  ${signBlock}
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
