import { useState } from "react";
import type { LeaveType } from "../types";
import { annualQuota, LEAVE_HINT, LEAVE_LABEL, LEAVE_META, LEAVE_TYPES, leaveLength, leavesOverlap, usedAnnualDays } from "../lib/leaves";
import { useStore } from "../state/store";
import { Button, Card, Field, Input, Select } from "../ui/controls";

export function LeavesPage({ year }: { year: number }) {
  const { state, addLeave, removeLeave } = useStore();
  const [employeeId, setEmployeeId] = useState(state.employees[0]?.id ?? "");
  const [type, setType] = useState<LeaveType>("annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");
  const [documentNo, setDocumentNo] = useState("");
  const [institution, setInstitution] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    if (!employeeId) {
      setError("Personel seçin.");
      return;
    }
    if (!startDate) {
      setError("Başlangıç tarihi gerekli.");
      return;
    }
    const end = type === "daily" ? startDate : endDate || startDate;
    if (end < startDate) {
      setError("Bitiş, başlangıçtan önce olamaz.");
      return;
    }
    if (type === "daily" && end !== startDate) {
      setError("Günlük izinde başlangıçla aynı olmalı.");
      return;
    }
    if (leavesOverlap(employeeId, startDate, end, state.leaves)) {
      setError("Bu tarihlerde başka bir izin kaydı var.");
      return;
    }
    addLeave({
      employeeId,
      startDate,
      endDate: end,
      type,
      note,
      documentNo,
      institution,
      ...LEAVE_META[type],
    });
    setNote("");
    setDocumentNo("");
    setInstitution("");
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card title="İzin kayıtları">
        {state.leaves.length === 0 ? (
          <p className="text-sm text-ink-soft">Kayıt yok. Tek günlük yoklama çizelge hücresinden de yazılabilir.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-ink-soft">
                  <th className="pb-2 font-medium">Personel</th>
                  <th className="pb-2 font-medium">Tür</th>
                  <th className="pb-2 font-medium">Tarih</th>
                  <th className="pb-2 font-medium">Gün</th>
                  <th className="pb-2 font-medium">Belge</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...state.leaves]
                  .sort((a, b) => b.startDate.localeCompare(a.startDate))
                  .map((leave) => {
                    const person = state.employees.find((e) => e.id === leave.employeeId);
                    return (
                      <tr key={leave.id} className="border-t border-rule">
                        <td className="py-2">{person?.name ?? "—"}</td>
                        <td className="py-2">{LEAVE_LABEL[leave.type]}</td>
                        <td className="py-2 font-mono text-xs">
                          {leave.startDate}
                          {leave.endDate !== leave.startDate ? ` → ${leave.endDate}` : ""}
                        </td>
                        <td className="py-2 font-mono">{leaveLength(leave)}</td>
                        <td className="py-2 text-xs text-ink-soft">
                          {[leave.documentNo, leave.institution, leave.note].filter(Boolean).join(" · ") || "—"}
                        </td>
                        <td className="py-2 text-right">
                          <Button size="sm" variant="warn" onClick={() => removeLeave(leave.id)}>
                            Sil
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="space-y-4">
        <Card title="Kayıt ekle">
          <div className="space-y-3">
            <Field label="Personel">
              <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="">Seçin</option>
                {state.employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tür" hint={LEAVE_HINT[type]}>
              <Select value={type} onChange={(e) => setType(e.target.value as LeaveType)}>
                {LEAVE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {LEAVE_LABEL[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Başlangıç">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            {type !== "daily" ? (
              <Field label="Bitiş">
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </Field>
            ) : null}
            {type === "report" ? (
              <>
                <Field label="Rapor no">
                  <Input value={documentNo} onChange={(e) => setDocumentNo(e.target.value)} />
                </Field>
                <Field label="Kurum">
                  <Input value={institution} onChange={(e) => setInstitution(e.target.value)} />
                </Field>
              </>
            ) : null}
            <Field label="Not">
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            {error ? <p className="text-sm text-warn">{error}</p> : null}
            <Button variant="ink" onClick={submit}>
              Kaydet
            </Button>
          </div>
        </Card>

        <Card title="Yıllık hak">
          {state.employees.length === 0 ? (
            <p className="text-sm text-ink-soft">Personel ekleyin.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {state.employees.map((e) => {
                const quota = annualQuota(e.annualLeaveDays, state.settings.annualLeaveDays);
                const used = usedAnnualDays(e.id, state.leaves, year);
                return (
                  <li key={e.id} className="flex justify-between gap-2 border-t border-rule pt-2 first:border-t-0 first:pt-0">
                    <span>{e.name}</span>
                    <span className={used > quota ? "font-mono text-warn" : "font-mono"}>
                      {used}/{quota}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
