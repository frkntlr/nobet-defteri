import { useMemo, useState } from "react";
import type { IsoDate, LeaveType, Shift } from "../types";
import { cn } from "../lib/cn";
import { dayNumber, formatLong, fromIso, isWeekend, MONTHS_TR, monthDays, monthLabel, toIso, WEEKDAYS_TR, weekdayMon0 } from "../lib/dates";
import { holidayOn } from "../lib/holidays";
import { cellLetter, LEAVE_LABEL, LEAVE_SHORT, LEAVE_TYPES } from "../lib/leaves";
import { cellClass, cellTitle, leaveSwatch, orderedEmployees, tagsFor } from "../lib/labels";
import { clashesWith } from "../lib/separations";
import { dayCoverage, genderMin, scheduleForMonth, wouldEmptyMaleMorning, wouldEmptyMaleNight } from "../lib/schedule";
import { weekdayListLabel } from "../lib/cycle";
import { PATTERN_LABEL, SHIFT_LABEL, SOURCE_LABEL, visibleSignatories } from "../lib/storage";
import { useStore } from "../state/store";
import { Button, Card } from "../ui/controls";

function Swatch({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-rule bg-white px-2.5 py-1">
      <span className={cn("inline-flex size-5 items-center justify-center rounded-sm font-mono text-[10px] font-bold", swatch)}>
        ·
      </span>
      {label}
    </span>
  );
}

export function SchedulePage({ year, month, onMonth }: { year: number; month: number; onMonth: (y: number, m: number) => void }) {
  const { state, setManual, setDayLeave, clearManuals, rebalance, moveEmployee } = useStore();
  const days = useMemo(() => monthDays(year, month), [year, month]);
  const result = useMemo(() => scheduleForMonth(state, year, month), [state, year, month]);
  const [edit, setEdit] = useState<{ employeeId: string; date: IsoDate } | null>(null);
  const active = state.employees.filter((e) => e.active);
  const editingPerson = edit ? state.employees.find((e) => e.id === edit.employeeId) : null;
  const editingCell = edit ? result.cells[`${edit.employeeId}|${edit.date}`] : null;
  const nightGapSet = new Set(result.maleNightGaps.map((g) => g.date));
  const morningGapSet = new Set(result.maleMorningGaps.map((g) => g.date));
  const coverageGaps = [
    ...result.maleMorningGaps.map((g) => ({ ...g, kind: "morning" as const })),
    ...result.maleNightGaps.map((g) => ({ ...g, kind: "night" as const, shift: "night" as const })),
  ];

  const prevMonth = () => {
    if (month === 0) onMonth(year - 1, 11);
    else onMonth(year, month - 1);
  };
  const nextMonth = () => {
    if (month === 11) onMonth(year + 1, 0);
    else onMonth(year, month + 1);
  };

  const applyShift = (shift: Shift) => {
    if (!edit) return;
    setDayLeave(edit.employeeId, edit.date, null);
    setManual(edit.employeeId, edit.date, shift);
    setEdit(null);
  };

  const applyLeave = (type: LeaveType) => {
    if (!edit) return;
    setManual(edit.employeeId, edit.date, null);
    setDayLeave(edit.employeeId, edit.date, type);
    setEdit(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Button onClick={prevMonth}>‹</Button>
            <h1 className="min-w-40 text-center text-lg font-semibold sm:text-xl">{monthLabel(year, month)}</h1>
            <Button onClick={nextMonth}>›</Button>
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            Sabah {state.settings.morningStart}–{state.settings.morningEnd} · Gece {state.settings.nightStart}–
            {state.settings.nightEnd}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={rebalance}>Döngüleri dengele</Button>
          <Button onClick={clearManuals}>Elle değişiklikleri sil</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Swatch
          swatch="bg-morning-bg text-morning"
          label={`Sabah (${state.settings.morningStart}–${state.settings.morningEnd})`}
        />
        <Swatch swatch="bg-night text-paper" label={`Gece (${state.settings.nightStart}–${state.settings.nightEnd})`} />
        <Swatch swatch="border border-rule text-ink-soft" label="boş tatil" />
        {LEAVE_TYPES.map((t) => (
          <Swatch key={t} swatch={leaveSwatch(t)} label={`${LEAVE_SHORT[t]} ${LEAVE_LABEL[t]}`} />
        ))}
        <Swatch swatch="bg-[#dcdcdc] text-ink" label="Cmt Cumartesi · Paz Pazar" />
        <Swatch swatch="bg-[#8a6a12] text-paper" label="RT resmi tatil (çalışılır)" />
        <Swatch swatch="ring-1 ring-ink" label="Elle" />
        <Swatch swatch="bg-ok/15 text-ok" label="Yedek" />
      </div>

      {active.some((e) => e.gender === "male") && coverageGaps.length > 0 ? (
        <div className="rounded-lg border-2 border-warn bg-[#f8e8e4] px-4 py-3 text-sm text-warn">
          <p className="font-semibold">Erkek sabah veya gece boş — her vardiyada en az 1 erkek olmalı</p>
          <p className="mt-1 text-warn/90">
            {coverageGaps
              .slice(0, 10)
              .map((g) => {
                const d = fromIso(g.date);
                return `${d.getDate()} ${MONTHS_TR[d.getMonth()]} ${g.kind === "morning" ? "sabah" : "gece"}`;
              })
              .join(" · ")}
            {coverageGaps.some((g) => g.reason === "manual")
              ? " · Elle kilitlenen hücreler yüzünden sistem yerini dolduramadı."
              : coverageGaps.some((g) => g.reason === "leave")
                ? " · O günlerde bütün erkekler izinli."
                : ""}
          </p>
          <p className="mt-1 text-xs">
            Öncelik: sabah ve gece bir erkek, sonra 15 gün, sonra 2+2, olabiliyorsa gece iki erkek. Kilitli olmayan
            hücreler bu sıraya göre yeniden ayarlanır.
          </p>
        </div>
      ) : active.some((e) => e.gender === "male") ? (
        <div className="rounded-lg border border-ok/20 bg-[#e7f3ec] px-4 py-2 text-sm text-ok">
          Bu ay her sabah ve her gecede en az 1 erkek nöbetçi var. Elle değişiklik yapsanız da boş vardiya bırakılırsa
          burası kırmızı uyarıya döner.
        </div>
      ) : null}

      {result.rhythmBreaks.length > 0 ? (
        <div className="rounded-lg border border-warn/30 bg-[#f8e8e4] px-4 py-3 text-sm text-warn">
          <p className="font-semibold">2 iş / 2 off ritmi bozuldu</p>
          <p className="mt-1 text-warn/90">
            {result.rhythmBreaks
              .slice(0, 8)
              .map((b) => {
                const person = state.employees.find((e) => e.id === b.employeeId)?.name ?? "Personel";
                const d = fromIso(b.date);
                return `${person} · ${d.getDate()} ${MONTHS_TR[d.getMonth()]} ${
                  b.kind === "streak" ? "3+ gün iş" : "tatil 2 günden kısa"
                }`;
              })
              .join(" · ")}
          </p>
          <p className="mt-1 text-xs">
            2 gün nöbet sığmazsa 1 gün yazılabilir; iki iş bloğu arasında kesinlikle 2 gün tatil olur.
          </p>
        </div>
      ) : null}

      {result.separationClashes.length > 0 ? (
        <div className="rounded-lg border-2 border-[#8a4b12] bg-[#f4e2c4] px-4 py-3 text-sm text-[#6b3410]">
          <p className="font-semibold">Beraber çalışmasın kuralı ihlal edildi</p>
          <p className="mt-1">
            {result.separationClashes
              .slice(0, 6)
              .map((c) => {
                const d = fromIso(c.date);
                const a = state.employees.find((e) => e.id === c.employeeIdA)?.name ?? "Personel";
                const b = state.employees.find((e) => e.id === c.employeeIdB)?.name ?? "Personel";
                return `${a} ve ${b} · ${d.getDate()} ${MONTHS_TR[d.getMonth()]} ${c.shift === "morning" ? "sabah" : "gece"}`;
              })
              .join(" · ")}
          </p>
        </div>
      ) : null}

      {active.length > 0 &&
      result.issues.filter(
        (i) => !(i.section === "male" && i.shift === "night") && !(i.section === "female" && i.shift === "morning"),
      ).length > 0 ? (
        <div className="rounded-lg border border-warn/30 bg-[#f8e8e4] px-4 py-3 text-sm text-warn">
          <p className="font-semibold">Bölümde açık vardiya var</p>
          <p className="mt-1 text-warn/90">
            {result.issues
              .filter(
                (i) =>
                  !(i.section === "male" && i.shift === "night") &&
                  !(i.section === "female" && i.shift === "morning"),
              )
              .slice(0, 8)
              .map((issue) => {
                const d = fromIso(issue.date);
                return `${d.getDate()} ${MONTHS_TR[d.getMonth()]} ${issue.shift === "morning" ? "sabah" : "gece"} ${issue.actual}/${issue.needed}`;
              })
              .join(" · ")}
          </p>
        </div>
      ) : null}

      {active.length === 0 ? (
        <Card title="Personel yok">
          <p className="text-sm text-ink-soft">Çizelge için önce Personel sayfasından ekip ekleyin.</p>
        </Card>
      ) : (
        <div className="overflow-auto rounded-lg border border-ink bg-white">
          <table className="w-max min-w-full border-collapse text-center">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 border border-ink bg-[#222] px-2 py-1.5 text-left text-xs font-semibold text-white">
                  Personel
                </th>
                {days.map((day) => {
                  const iso = toIso(day);
                  const counts = dayCoverage(result, iso, state.employees);
                  const hasMale = active.some((e) => e.gender === "male");
                  const hasFemale = active.some((e) => e.gender === "female");
                  const short =
                    (hasMale &&
                      (counts.maleMorning < genderMin(state.settings, "male", "morning") ||
                        counts.maleNight < genderMin(state.settings, "male", "night"))) ||
                    (hasFemale && counts.femaleNight < genderMin(state.settings, "female", "night"));
                  const weekend = isWeekend(day);
                  const holiday = state.settings.showHolidays ? holidayOn(iso, state.holidays) : undefined;
                  const emptyNight = nightGapSet.has(iso);
                  const emptyMorning = morningGapSet.has(iso);
                  return (
                    <th
                      key={iso}
                      title={
                        emptyNight
                          ? "Erkek gece nöbeti boş"
                          : emptyMorning
                            ? "Erkek sabah nöbeti boş"
                            : holiday
                              ? `${holiday.name}${holiday.halfDay ? " (yarım gün)" : ""} · vardiya devam eder`
                              : weekend
                                ? WEEKDAYS_TR[weekdayMon0(day)] === "Cmt"
                                  ? "Cumartesi"
                                  : "Pazar"
                                : undefined
                      }
                      className={cn(
                        "min-w-10 border border-ink px-0.5 py-1 text-[10px] font-semibold",
                        weekend && !holiday && !emptyNight && !emptyMorning ? "bg-[#dcdcdc] text-ink" : "",
                        !weekend && !holiday && !emptyNight && !emptyMorning ? "bg-[#f4f4f4] text-ink" : "",
                        holiday ? "bg-[#c4c4c4] text-ink" : "",
                        emptyNight && !holiday ? "bg-warn text-paper" : "",
                        emptyMorning && !holiday && !emptyNight ? "bg-[#8a4b12] text-[#f8ecd0]" : "",
                        short && !holiday && !emptyNight && !emptyMorning ? "text-warn" : "",
                      )}
                    >
                      <div className="leading-none">{WEEKDAYS_TR[weekdayMon0(day)]}</div>
                      <div className="mt-0.5 font-mono text-sm font-extrabold leading-none">{dayNumber(day)}</div>
                      {holiday ? <div className="text-[8px] font-semibold">RT</div> : null}
                      {emptyNight ? <div className="text-[8px] font-semibold">GECE</div> : null}
                      {emptyMorning && !emptyNight ? <div className="text-[8px] font-semibold">SABAH</div> : null}
                    </th>
                  );
                })}
                <th className="border border-ink bg-[#222] px-2 py-1.5 text-xs text-white">Saat</th>
              </tr>
            </thead>
            <tbody>
              {orderedEmployees(active).map((person, index) => {
                      const hours = result.hours.find((h) => h.employeeId === person.id);
                      return (
                        <tr key={person.id}>
                          <th className="sticky left-0 z-10 border border-ink bg-[#f7f4ee] px-1.5 py-1 text-left">
                            <div className="flex items-center gap-1">
                              <div className="flex shrink-0 flex-col">
                                <button
                                  type="button"
                                  className="h-4 w-5 border border-ink bg-white text-[10px] leading-none disabled:opacity-30"
                                  disabled={index === 0}
                                  onClick={() => moveEmployee(person.id, -1, true)}
                                  title="Yukarı"
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  className="h-4 w-5 border border-x border-b border-ink bg-white text-[10px] leading-none disabled:opacity-30"
                                  disabled={index === active.length - 1}
                                  onClick={() => moveEmployee(person.id, 1, true)}
                                  title="Aşağı"
                                >
                                  ↓
                                </button>
                              </div>
                              <div className="min-w-0">
                            <div className="truncate text-sm font-bold leading-tight">{person.name}</div>
                            {tagsFor(person, state.tags ?? []).length > 0 ? (
                              <div className="mt-0.5 flex flex-wrap gap-1">
                                {tagsFor(person, state.tags ?? []).map((tag) => (
                                  <span
                                    key={tag.id}
                                    className="rounded-full bg-[#ebe4d8] px-1.5 py-0 text-[9px] font-medium normal-case tracking-normal text-ink"
                                  >
                                    {tag.name}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                            <div className="text-[9px] tracking-wide text-ink-soft uppercase">
                              {PATTERN_LABEL[person.pattern]}
                              {person.pattern === "selected_morning" ||
                              (person.pattern === "fixed_morning" && (person.workWeekdays?.length ?? 0) > 0)
                                ? ` · ${weekdayListLabel(person.workWeekdays)}`
                                : ""}
                            </div>
                              </div>
                            </div>
                          </th>
                          {result.days.map((iso) => {
                            const cell = result.cells[`${person.id}|${iso}`];
                            const clash = result.separationClashes.some(
                              (c) =>
                                c.date === iso && (c.employeeIdA === person.id || c.employeeIdB === person.id),
                            );
                            const emptyNight = nightGapSet.has(iso) && person.gender === "male";
                            const emptyMorning = morningGapSet.has(iso) && person.gender === "male";
                            const weekend = isWeekend(fromIso(iso));
                            return (
                              <td
                                key={iso}
                                className={cn("border border-ink p-0", weekend ? "bg-[#ececec]" : "bg-white")}
                              >
                                <button
                                  type="button"
                                  onClick={() => setEdit({ employeeId: person.id, date: iso })}
                                  className={cn(
                                    "flex h-8 w-full min-w-9 items-center justify-center font-mono text-[11px] font-semibold",
                                    cell ? cellClass(cell) : "",
                                    !cell || cell.shift === "off" ? (weekend ? "bg-[#ececec]" : "bg-white") : "",
                                    cell?.source === "manual" ? "outline outline-1 outline-ink outline-offset-[-1px]" : "",
                                    cell?.source === "fill" ? "outline outline-1 outline-ok outline-offset-[-1px]" : "",
                                    clash ? "outline outline-2 outline-[#c26a1a] outline-offset-[-1px]" : "",
                                    emptyNight && cell?.shift !== "night" ? "outline outline-2 outline-warn outline-offset-[-1px]" : "",
                                    emptyMorning && cell?.shift !== "morning" ? "outline outline-1 outline-[#8a4b12] outline-offset-[-1px]" : "",
                                  )}
                                  title={cellTitle(cell, holidayOn(iso, state.holidays)?.name)}
                                >
                                  {cell ? cellLetter(cell.shift, cell.leaveType) : ""}
                                </button>
                              </td>
                            );
                          })}
                          <td className="border border-ink px-2 py-1 font-mono text-sm">{hours?.hours ?? 0}</td>
                        </tr>
                      );
                    })}
            </tbody>
          </table>
        </div>
      )}

      <Card title="Aylık özet">
        <div className="overflow-x-auto">
          <table className="w-full min-w-lg text-left text-sm">
            <thead>
              <tr className="text-xs text-ink-soft">
                {["Personel", "Nöbet", "Saat", "Yıllık", "Normal", "Günlük", "Rapor", "İstirahat", "Ücretsiz", "Tatil nöbet", "Yedek"].map(
                  (h) => (
                    <th key={h} className="pb-2 font-medium">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {orderedEmployees(active).map((person) => {
                  const row = result.hours.find((h) => h.employeeId === person.id);
                  if (!row) return null;
                  return (
                    <tr key={row.employeeId} className="border-t border-rule">
                      <td className="py-2 text-lg font-extrabold">
                        {person.name}
                      </td>
                      <td
                        className={cn(
                          "font-mono",
                          row.requiredWorkDays > 0 && row.workShifts < row.requiredWorkDays ? "text-warn" : "",
                        )}
                      >
                        {row.workShifts}
                        {state.settings.targetWorkDays > 0 ? (
                          <span className="ml-1 text-[10px] text-ink-soft">/{row.requiredWorkDays}</span>
                        ) : null}
                      </td>
                      <td className="font-mono">{row.hours}</td>
                      <td className="font-mono">{row.annualDays}</td>
                      <td className="font-mono">{row.normalDays}</td>
                      <td className="font-mono">{row.dailyDays}</td>
                      <td className="font-mono">{row.reportDays}</td>
                      <td className="font-mono">{row.restDays}</td>
                      <td className="font-mono">{row.unpaidDays}</td>
                      <td className="font-mono">{row.holidayWorkDays}</td>
                      <td className="font-mono">{row.fillShifts}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Çıktı imza alanı">
        <p className="mb-3 text-xs text-ink-soft">
          PDF’in altında yalnızca aktif yetkililer basılır. Pasif yapmak veya silmek için Ayarlar’a gidin.
        </p>
        {visibleSignatories(state.signatories).length === 0 ? (
          <p className="text-sm text-ink-soft">Aktif imza yetkilisi yok. Ayarlar’dan ekleyin veya pasifi aktif edin.</p>
        ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {visibleSignatories(state.signatories).map((s) => (
              <div key={s.id} className="flex min-h-40 flex-col items-center rounded-lg border border-rule bg-white px-3 py-4 text-center">
                <div className="min-h-12">
                  <p className="text-sm font-semibold leading-snug">{s.name.trim() || "Ad soyad"}</p>
                  <p className="mt-1 text-xs leading-snug text-ink-soft">{s.position.trim() || "Pozisyon"}</p>
                </div>
                <div className="mt-auto flex w-full flex-1 flex-col justify-end pt-8">
                  <div className="mx-auto w-[86%] border-b border-ink" />
                  <p className="mt-1 text-[10px] uppercase tracking-widest text-ink-soft">İmza</p>
                </div>
              </div>
            ))}
        </div>
        )}
      </Card>

      {edit && editingPerson && editingCell ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center" onClick={() => setEdit(null)}>
          <div
            className="w-full max-w-md rounded-xl border border-rule bg-paper p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-morning">Hücre</p>
            <h3 className="mt-1 text-lg font-semibold">{editingPerson.name}</h3>
            <p className="text-sm text-ink-soft">{formatLong(fromIso(edit.date))}</p>
            {holidayOn(edit.date, state.holidays) ? (
              <p className="mt-1 text-xs font-medium text-[#8a6a12]">
                Resmi tatil: {holidayOn(edit.date, state.holidays)?.name}. Vardiya devam eder.
              </p>
            ) : null}
            <p className="mt-2 text-xs text-ink-soft">
              Otomatik öneri: {SHIFT_LABEL[editingCell.original]}
              {editingCell.source === "auto"
                ? ""
                : ` · şu an: ${editingCell.shift === "leave" && editingCell.leaveType ? LEAVE_LABEL[editingCell.leaveType] : SHIFT_LABEL[editingCell.shift]} (${SOURCE_LABEL[editingCell.source]})`}
            </p>
            {(["morning", "night"] as const).map((shift) => {
              const names = clashesWith(state.separations, edit.employeeId, edit.date, shift, result.cells)
                .map((id) => state.employees.find((e) => e.id === id)?.name ?? "Personel")
                .join(", ");
              if (!names) return null;
              return (
                <p key={shift} className="mt-2 rounded-md bg-[#f4e2c4] px-2 py-1.5 text-xs text-[#6b3410]">
                  {SHIFT_LABEL[shift]} yazarsanız {names} ile aynı vardiyada olursunuz (beraber çalışmasın).
                </p>
              );
            })}
            {wouldEmptyMaleNight(result, state.employees, edit.employeeId, edit.date, "off", state.settings) ? (
              <p className="mt-2 rounded-md border border-warn/30 bg-[#f8e8e4] px-2 py-1.5 text-xs text-warn">
                Bu erkek şu an gecedeki tek nöbetçi. Off, sabah veya izin yazarsanız {fromIso(edit.date).getDate()}{" "}
                {MONTHS_TR[fromIso(edit.date).getMonth()]} gecesi boş kalır. Sistem kilitli olmayan başka erkeği geceye
                almaya çalışır; kimse yoksa çizelge uyarır.
              </p>
            ) : null}
            {wouldEmptyMaleMorning(result, state.employees, edit.employeeId, edit.date, "off", state.settings) ? (
              <p className="mt-2 rounded-md border border-[#8a4b12]/40 bg-[#f4e2c4] px-2 py-1.5 text-xs text-[#6b3410]">
                Bu erkek şu an sabahtaki tek nöbetçi. Off, gece veya izin yazarsanız {fromIso(edit.date).getDate()}{" "}
                {MONTHS_TR[fromIso(edit.date).getMonth()]} sabahı boş kalır. Önce başka bir erkeği sabaha alın.
              </p>
            ) : null}
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Button variant="morning" onClick={() => applyShift("morning")}>
                Sabah
              </Button>
              <Button variant="night" onClick={() => applyShift("night")}>
                Gece
              </Button>
              <Button onClick={() => applyShift("off")}>Off</Button>
            </div>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Yoklama</p>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {LEAVE_TYPES.map((type) => (
                <Button key={type} size="sm" className={leaveSwatch(type)} onClick={() => applyLeave(type)}>
                  {LEAVE_SHORT[type]} {LEAVE_LABEL[type]}
                </Button>
              ))}
            </div>
            <Button
              className="mt-3 w-full"
              onClick={() => {
                setDayLeave(edit.employeeId, edit.date, null);
                setManual(edit.employeeId, edit.date, null);
                setEdit(null);
              }}
            >
              Otomatiğe dön
            </Button>
            <p className="mt-3 text-xs text-ink-soft">
              Tek günlük yoklama buradan yazılır. Çok günlü yıllık izin, rapor ve istirahat İzinler sayfasındadır.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
