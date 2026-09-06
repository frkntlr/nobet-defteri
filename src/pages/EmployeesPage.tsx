import { Fragment, useMemo, useState } from "react";
import type { EmployeeDraft, Pattern } from "../types";
import { WEEKDAY_LONG, hasCustomRhythm, weekdayListLabel } from "../lib/cycle";
import { groupedEmployees, tagsFor } from "../lib/labels";
import { GENDER_LABEL, NAME_PLACEHOLDERS, PATTERN_LABEL } from "../lib/storage";
import { useStore } from "../state/store";
import { Button, Card, Field, Input, Select } from "../ui/controls";

const emptyDraft = (): EmployeeDraft => ({
  name: "",
  gender: "male",
  pattern: "rotating",
  autoOffset: true,
  cycleOffset: 0,
  workDays: null,
  offDays: null,
  workWeekdays: [],
  annualLeaveDays: null,
  notes: "",
  tagIds: [],
  separateFrom: [],
});

export function EmployeesPage() {
  const { state, addEmployee, updateEmployee, removeEmployee, addSeparation, removeSeparation, addTag, updateTag, removeTag } =
    useStore();
  const [draft, setDraft] = useState<EmployeeDraft>(emptyDraft);
  const [editing, setEditing] = useState<string | null>(null);
  const [newTag, setNewTag] = useState("");
  const placeholder = NAME_PLACEHOLDERS[state.employees.length % NAME_PLACEHOLDERS.length];

  const startEdit = (id: string) => {
    const person = state.employees.find((e) => e.id === id);
    if (!person) return;
    setEditing(id);
    setDraft({
      name: person.name,
      gender: person.gender,
      pattern: person.pattern,
      autoOffset: person.autoOffset,
      cycleOffset: person.cycleOffset,
      workDays: person.workDays,
      offDays: person.offDays,
      workWeekdays: person.workWeekdays ?? [],
      annualLeaveDays: person.annualLeaveDays,
      notes: person.notes,
      tagIds: person.tagIds ?? [],
      separateFrom: state.separations
        .filter((s) => s.employeeIdA === id || s.employeeIdB === id)
        .map((s) => (s.employeeIdA === id ? s.employeeIdB : s.employeeIdA)),
    });
  };

  const save = () => {
    const name = draft.name.trim();
    if (!name) return;
    if (editing) {
      updateEmployee(editing, {
        name,
        gender: draft.gender,
        pattern: draft.pattern,
        autoOffset: draft.autoOffset,
        cycleOffset: draft.cycleOffset,
        workDays: draft.workDays,
        offDays: draft.offDays,
        workWeekdays: draft.workWeekdays,
        annualLeaveDays: draft.annualLeaveDays,
        notes: draft.notes,
        tagIds: draft.tagIds,
      });
      setEditing(null);
    } else {
      addEmployee({ ...draft, name });
    }
    setDraft(emptyDraft());
  };

  const demo = () => {
    const samples: Array<{ name: string; gender: "male" | "female"; pattern: Pattern }> = [
      { name: "Ahmet Yılmaz", gender: "male", pattern: "rotating" },
      { name: "Mehmet Kaya", gender: "male", pattern: "rotating" },
      { name: "Can Özkan", gender: "male", pattern: "rotating" },
      { name: "Hasan Koç", gender: "male", pattern: "fixed_night" },
      { name: "Elif Demir", gender: "female", pattern: "rotating" },
      { name: "Ayşe Çelik", gender: "female", pattern: "fixed_morning" },
    ];
    for (const s of samples) {
      if (state.employees.some((e) => e.name === s.name)) continue;
      addEmployee({ ...emptyDraft(), ...s, autoOffset: true });
    }
  };

  const partners = useMemo(
    () =>
      state.separations.map((s) => ({
        ...s,
        a: state.employees.find((e) => e.id === s.employeeIdA)?.name ?? "Personel",
        b: state.employees.find((e) => e.id === s.employeeIdB)?.name ?? "Personel",
      })),
    [state.separations, state.employees],
  );

  const toggleWeekday = (index: number) => {
    const on = draft.workWeekdays.includes(index);
    setDraft({
      ...draft,
      pattern: draft.pattern === "rotating" && !on ? "selected_morning" : draft.pattern,
      workWeekdays: on
        ? draft.workWeekdays.filter((d) => d !== index)
        : [...draft.workWeekdays, index].sort((a, b) => a - b),
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card title={editing ? "Personeli düzenle" : "Personel ekle"}>
          <p className="mb-3 text-sm text-ink-soft">
            Sabit gün vermek için <span className="font-medium text-ink">Hangi günler gelsin</span> satırından
            Pazartesi–Pazar’ı işaretleyin. Vardiya tipi «Seçili günler (sabah)» olur.
          </p>
          <div className="space-y-3">
            <Field label="Ad soyad">
              <Input
                value={draft.name}
                placeholder={placeholder}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Field label="Bölüm" hint="Erkek personel erkek bölümünü, bayan personel bayan bölümünü tutar.">
              <Select
                value={draft.gender}
                onChange={(e) => setDraft({ ...draft, gender: e.target.value as EmployeeDraft["gender"] })}
              >
                <option value="male">Erkek</option>
                <option value="female">Bayan</option>
              </Select>
            </Field>
            <div>
              <div className="text-sm font-medium">Hangi günler gelsin</div>
              <p className="mt-0.5 text-xs text-ink-soft">
                İşaretlenen günler sabah yazılır. Boş bırakılırsa dönen / sabahçı / gececi ritmi kullanılır. Özel iş
                ritmi açık olsa bile işaretli günler gelir.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {WEEKDAY_LONG.map((label, index) => {
                  const on = draft.workWeekdays.includes(index);
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => toggleWeekday(index)}
                      className={`rounded-md border px-2 py-2 text-left text-xs font-medium ${
                        on ? "border-ink bg-ink text-paper" : "border-rule bg-white text-ink"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <Field
              label="Vardiya tipi"
              hint="Gün seçtiyseniz «Seçili günler (sabah)» kalır. Dönen ekip 2 iş / 2 off gider."
            >
              <Select
                value={draft.pattern}
                onChange={(e) => {
                  const pattern = e.target.value as Pattern;
                  setDraft({
                    ...draft,
                    pattern,
                    workWeekdays:
                      pattern === "selected_morning" && draft.workWeekdays.length === 0
                        ? [0, 1, 2, 3, 4]
                        : pattern !== "selected_morning" && pattern !== "fixed_morning"
                          ? []
                          : draft.workWeekdays,
                  });
                }}
              >
                <option value="selected_morning">{PATTERN_LABEL.selected_morning}</option>
                <option value="rotating">{PATTERN_LABEL.rotating}</option>
                <option value="fixed_morning">{PATTERN_LABEL.fixed_morning}</option>
                <option value="fixed_night">{PATTERN_LABEL.fixed_night}</option>
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={hasCustomRhythm(draft)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    workDays: e.target.checked ? (draft.workDays ?? state.settings.workDays) : null,
                    offDays: e.target.checked ? (draft.offDays ?? state.settings.offDays) : null,
                  })
                }
              />
              Özel iş ritmi
            </label>
            {hasCustomRhythm(draft) ? (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Art arda iş" hint="Kişiye özel. Varsayılan 2.">
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={draft.workDays ?? 2}
                    onChange={(e) => setDraft({ ...draft, workDays: Math.max(1, Number(e.target.value) || 2) })}
                  />
                </Field>
                <Field label="Off günü" hint="Kişiye özel. Varsayılan 2.">
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={draft.offDays ?? 2}
                    onChange={(e) => setDraft({ ...draft, offDays: Math.max(1, Number(e.target.value) || 2) })}
                  />
                </Field>
              </div>
            ) : null}
            {draft.pattern !== "selected_morning" ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={draft.autoOffset}
                  onChange={(e) => setDraft({ ...draft, autoOffset: e.target.checked })}
                />
                Döngü kaydırmasını otomatik seç
              </label>
            ) : null}
            {draft.pattern !== "selected_morning" && !draft.autoOffset ? (
              <Field label="Kaydırma" hint="0: dönemin ilk günü işe başlar. 2: iki gün kaymış grup.">
                <Input
                  type="number"
                  min={0}
                  max={20}
                  value={draft.cycleOffset}
                  onChange={(e) => setDraft({ ...draft, cycleOffset: Number(e.target.value) || 0 })}
                />
              </Field>
            ) : null}
            <Field
              label="Yıllık izin hakkı"
              hint={`Boş bırakılırsa ayarlardaki ${state.settings.annualLeaveDays} gün kullanılır.`}
            >
              <Input
                type="number"
                min={0}
                value={draft.annualLeaveDays ?? ""}
                placeholder={String(state.settings.annualLeaveDays)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    annualLeaveDays: e.target.value === "" ? null : Number(e.target.value) || 0,
                  })
                }
              />
            </Field>
            <Field
              label="Etiketler"
              hint="Çizelgede ismin altında görünür. Yeni etiket aşağıdaki kutudan eklenir."
            >
              {(state.tags ?? []).length === 0 ? (
                <p className="text-xs text-ink-soft">Henüz etiket yok. Aşağıdan ekleyin.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(state.tags ?? []).map((tag) => {
                    const on = draft.tagIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            tagIds: on ? draft.tagIds.filter((id) => id !== tag.id) : [...draft.tagIds, tag.id],
                          })
                        }
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                          on ? "border-ink bg-ink text-paper" : "border-rule bg-white text-ink"
                        }`}
                      >
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </Field>
            <Field label="Not">
              <Input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </Field>
            <Field label="Beraber çalışmasın" hint="Aynı vardiyada durmaz. Çizelgede turuncu uyarı çıkar.">
              <div className="max-h-40 space-y-1 overflow-auto rounded-md border border-rule bg-white p-2">
                {state.employees
                  .filter((e) => e.id !== editing)
                  .map((e) => (
                    <label key={e.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={draft.separateFrom.includes(e.id)}
                        onChange={(ev) => {
                          setDraft({
                            ...draft,
                            separateFrom: ev.target.checked
                              ? [...draft.separateFrom, e.id]
                              : draft.separateFrom.filter((id) => id !== e.id),
                          });
                          if (editing) {
                            if (ev.target.checked) addSeparation(editing, e.id);
                            else {
                              const found = state.separations.find(
                                (s) =>
                                  (s.employeeIdA === editing && s.employeeIdB === e.id) ||
                                  (s.employeeIdB === editing && s.employeeIdA === e.id),
                              );
                              if (found) removeSeparation(found.id);
                            }
                          }
                        }}
                      />
                      {e.name}
                      <span className="text-ink-soft"> · {GENDER_LABEL[e.gender]}</span>
                    </label>
                  ))}
              </div>
            </Field>
            <div className="flex gap-2">
              <Button variant="ink" onClick={save}>
                {editing ? "Kaydet" : "Ekle"}
              </Button>
              {editing ? (
                <Button
                  onClick={() => {
                    setEditing(null);
                    setDraft(emptyDraft());
                  }}
                >
                  Vazgeç
                </Button>
              ) : null}
            </div>
          </div>
        </Card>

        <Card title="Personel etiketleri">
          <p className="mb-3 text-xs text-ink-soft">
            Etiket adı değiştirilebilir, yenisi eklenebilir. Pasifleştirmek yerine silinince personelden de kalkar.
          </p>
          <div className="mb-3 flex gap-2">
            <Input
              value={newTag}
              placeholder="Yeni etiket, örn. Kıdemli"
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                const created = addTag(newTag);
                if (created) setNewTag("");
              }}
            />
            <Button
              onClick={() => {
                const created = addTag(newTag);
                if (created) setNewTag("");
              }}
            >
              Ekle
            </Button>
          </div>
          <ul className="space-y-2">
            {(state.tags ?? []).map((tag) => (
              <li key={tag.id} className="flex items-center gap-2">
                <Input value={tag.name} onChange={(e) => updateTag(tag.id, e.target.value)} />
                <Button size="sm" variant="warn" onClick={() => removeTag(tag.id)}>
                  Sil
                </Button>
              </li>
            ))}
          </ul>
        </Card>

        {partners.length > 0 ? (
          <Card title="Beraber çalışmasın çiftleri">
            <ul className="space-y-2 text-sm">
              {partners.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <span>
                    {p.a} ile {p.b} aynı vardiyada durmaz
                  </span>
                  <Button size="sm" onClick={() => removeSeparation(p.id)}>
                    Kaldır
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>

      <Card title="Personel listesi">
        {state.employees.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-ink-soft">
              Henüz personel yok. Soldaki formdan ad yazıp gün seçin veya örnek ekibi yükleyin.
            </p>
            <Button variant="ink" onClick={demo}>
              Örnek ekip ekle
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-ink-soft">
                  <th className="pb-2 font-medium">Ad</th>
                  <th className="pb-2 font-medium">Bölüm</th>
                  <th className="pb-2 font-medium">Vardiya</th>
                  <th className="pb-2 font-medium">Kaydırma</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {groupedEmployees(state.employees).map(({ gender, list }) =>
                  list.length === 0 ? null : (
                    <Fragment key={gender}>
                      {list.map((person) => (
                        <tr key={person.id} className="border-t border-rule">
                          <td className="py-3">
                            <div className="font-semibold">{person.name}</div>
                            {tagsFor(person, state.tags ?? []).length > 0 ? (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {tagsFor(person, state.tags ?? []).map((tag) => (
                                  <span
                                    key={tag.id}
                                    className="rounded-full bg-[#ebe4d8] px-2 py-0.5 text-[10px] font-medium text-ink"
                                  >
                                    {tag.name}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                            {!person.active ? <div className="text-xs text-ink-soft">Pasif</div> : null}
                          </td>
                          <td className="py-3">{GENDER_LABEL[person.gender]}</td>
                          <td className="py-3">
                            {PATTERN_LABEL[person.pattern]}
                            {(person.workWeekdays?.length ?? 0) > 0 ? (
                              <div className="text-[11px] text-ink-soft">{weekdayListLabel(person.workWeekdays)}</div>
                            ) : null}
                          </td>
                          <td className="py-3 font-mono">{person.autoOffset ? "otomatik" : person.cycleOffset}</td>
                          <td className="py-3 text-right">
                            <Button size="sm" onClick={() => startEdit(person.id)}>
                              Düzenle
                            </Button>
                            <Button
                              size="sm"
                              className="ml-2"
                              onClick={() => updateEmployee(person.id, { active: !person.active })}
                            >
                              {person.active ? "Pasifleştir" : "Aktif et"}
                            </Button>
                            <Button size="sm" variant="warn" className="ml-2" onClick={() => removeEmployee(person.id)}>
                              Sil
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
