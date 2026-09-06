import { useRef, useState } from "react";
import { HOLIDAY_KIND_LABEL } from "../lib/holidays";
import { SIGNATORY_ROLES } from "../lib/storage";
import { useStore } from "../state/store";
import { Button, Card, Field, Input } from "../ui/controls";
import { importBackupFile } from "../lib/backup";

export function SettingsPage() {
  const {
    state,
    updateSettings,
    resetDemo,
    replaceState,
    addSignatory,
    updateSignatory,
    removeSignatory,
    moveSignatory,
    addHoliday,
    removeHoliday,
    seedHolidays,
  } = useStore();
  const { settings } = state;
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [holidayName, setHolidayName] = useState("");
  const [holidayDate, setHolidayDate] = useState("");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Vardiya kuralları">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="İşyeri adı" hint="Çizelge ve PDF başlığında görünür.">
            <Input
              value={settings.workplaceName}
              onChange={(e) => updateSettings({ workplaceName: e.target.value })}
            />
          </Field>
          <Field label="Vardiya süresi (saat)">
            <Input
              type="number"
              min={1}
              max={24}
              value={settings.shiftHours}
              onChange={(e) => updateSettings({ shiftHours: Number(e.target.value) || 12 })}
            />
          </Field>
          <Field label="Sabah başlangıç">
            <Input value={settings.morningStart} onChange={(e) => updateSettings({ morningStart: e.target.value })} />
          </Field>
          <Field label="Sabah bitiş">
            <Input value={settings.morningEnd} onChange={(e) => updateSettings({ morningEnd: e.target.value })} />
          </Field>
          <Field label="Gece başlangıç">
            <Input value={settings.nightStart} onChange={(e) => updateSettings({ nightStart: e.target.value })} />
          </Field>
          <Field label="Gece bitiş">
            <Input value={settings.nightEnd} onChange={(e) => updateSettings({ nightEnd: e.target.value })} />
          </Field>
          <Field
            label="Art arda iş günü"
            hint="Varsayılan 2. 11’inde sabah, 12’sinde gece yazılabilir. Gece bitince ertesi sabah yazılmaz."
          >
            <Input
              type="number"
              min={1}
              max={10}
              value={settings.workDays}
              onChange={(e) => updateSettings({ workDays: Number(e.target.value) || 2 })}
            />
          </Field>
          <Field label="Off günü" hint="Varsayılan 2 gün off.">
            <Input
              type="number"
              min={1}
              max={10}
              value={settings.offDays}
              onChange={(e) => updateSettings({ offDays: Number(e.target.value) || 2 })}
            />
          </Field>
          <Field
            label="En az erkek — sabah"
            hint="1. öncelik. Her sabah en az 1 erkek. 0 kabul edilmez. Elle değişiklik olsa bile sistem açık sabahı doldurur."
          >
            <Input
              type="number"
              min={1}
              max={20}
              value={settings.minMaleMorning}
              onChange={(e) => updateSettings({ minMaleMorning: Math.max(1, Number(e.target.value) || 1) })}
            />
          </Field>
          <Field
            label="En az erkek — gece"
            hint="1. öncelik. Her gece en az 1 erkek. 0 kabul edilmez. Elle değişiklik bu kuralı kaldırmaz."
          >
            <Input
              type="number"
              min={1}
              max={20}
              value={settings.minMaleNight}
              onChange={(e) => updateSettings({ minMaleNight: Math.max(1, Number(e.target.value) || 1) })}
            />
          </Field>
          <Field
            label="Hedef erkek — gece"
            hint="4. öncelik. Sabah/gece tabanı, 15 gün ve 2+2 sağlandıktan sonra mümkünse 2 erkek gece yazar."
          >
            <Input
              type="number"
              min={1}
              max={20}
              value={settings.preferMaleNight}
              onChange={(e) => updateSettings({ preferMaleNight: Math.max(1, Number(e.target.value) || 2) })}
            />
          </Field>
          <Field
            label="İkinci grup — sabah tabanı"
            hint="Çizelgede sabah uyarısı çıkmaz. İsim veya bölüm basılmaz."
          >
            <Input
              type="number"
              min={0}
              max={20}
              value={settings.minFemaleMorning}
              onChange={(e) => updateSettings({ minFemaleMorning: Number(e.target.value) || 0 })}
            />
          </Field>
          <Field
            label="İkinci grup — gece tabanı"
            hint="Yalnızca gece eksiği uyarılır. Bölüm başlığı kullanılmaz."
          >
            <Input
              type="number"
              min={0}
              max={20}
              value={settings.minFemaleNight}
              onChange={(e) => updateSettings({ minFemaleNight: Number(e.target.value) || 0 })}
            />
          </Field>
          <Field
            label="Aylık iş hedefi"
            hint="Dönen ve sabit vardiya için en az bu kadar iş günü. 2 iş / 2 off bozulmadan eklenir. Seçili sabah günleri bu hedefe zorlanmaz; işaretlenen günler yine gelir."
          >
            <Input
              type="number"
              min={0}
              max={31}
              value={settings.targetWorkDays}
              onChange={(e) => updateSettings({ targetWorkDays: Number(e.target.value) || 0 })}
            />
          </Field>
          <Field label="Döngü sıfır tarihi" hint="2 iş / 2 off ritminin sıfırlandığı tarih.">
            <Input
              type="date"
              value={settings.cycleAnchor}
              onChange={(e) => updateSettings({ cycleAnchor: e.target.value })}
            />
          </Field>
          <Field label="Yıllık izin hakkı" hint="Kişiye özel hak Personel sayfasından verilir.">
            <Input
              type="number"
              min={0}
              value={settings.annualLeaveDays}
              onChange={(e) => updateSettings({ annualLeaveDays: Number(e.target.value) || 14 })}
            />
          </Field>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.rotateShifts}
            onChange={(e) => updateSettings({ rotateShifts: e.target.checked })}
          />
          Dönen ekipte sabah/gece değiştir
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.autoFillFemale}
            onChange={(e) => updateSettings({ autoFillFemale: e.target.checked })}
          />
          İkinci grupta açık vardiyayı otomatik doldur
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.showHolidays}
            onChange={(e) => updateSettings({ showHolidays: e.target.checked })}
          />
          Resmi tatilleri çizelgede göster
        </label>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-ink-soft">
          <li>Çizelge ve PDF’de cinsiyet veya bölüm başlığı yazılmaz. Personel sırası oklarla değişir.</li>
          <li>
            <span className="font-medium text-ink">1.</span> Her sabah ve her gece en az 1 erkek. Elle hücre kilitlense
            bile kilitli olmayan kişiler bu boşluğu doldurur; gerekirse 2+2 bozulur.
          </li>
          <li>
            <span className="font-medium text-ink">2.</span> Herkes (izin / elle off yoksa) ayda en az 15 gün çalışır.
            Seçili sabah günleri bu hedefe zorlanmaz; işaretlenen günler yine gelir.
          </li>
          <li>
            <span className="font-medium text-ink">3.</span> 2 iş / 2 tatil. 2 gün nöbet sığmazsa 1 gün yazılabilir;
            iki iş arasında kesinlikle 2 gün tatil olur.
          </li>
          <li>
            <span className="font-medium text-ink">4.</span> Olabiliyorsa gece 2 erkek. Sabahı boşaltmaz, 15 günü ve
            2+2’yi bozmaz.
          </li>
        </ul>
      </Card>

      <div className="space-y-4">
        <Card title="Çıktı imza yetkilileri">
          <p className="mb-3 text-xs text-ink-soft">
            Pasif yetkili çizelge ve PDF’de görünmez; kayıt silinmez. İsterseniz tamamen silebilirsiniz.
          </p>
          <datalist id="signatory-roles">
            {SIGNATORY_ROLES.map((role) => (
              <option key={role} value={role} />
            ))}
          </datalist>
          <div className="space-y-3">
            {[...state.signatories]
              .sort((a, b) => a.sort - b.sort)
              .map((s) => (
                <div
                  key={s.id}
                  className={`grid gap-2 sm:grid-cols-[1fr_1fr_auto] ${s.active === false ? "opacity-55" : ""}`}
                >
                  <Input
                    placeholder="Ad soyad"
                    value={s.name}
                    onChange={(e) => updateSignatory(s.id, { name: e.target.value })}
                  />
                  <Input
                    list="signatory-roles"
                    placeholder="Pozisyon"
                    value={s.position}
                    onChange={(e) => updateSignatory(s.id, { position: e.target.value })}
                  />
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" onClick={() => moveSignatory(s.id, -1)}>
                      ↑
                    </Button>
                    <Button size="sm" onClick={() => moveSignatory(s.id, 1)}>
                      ↓
                    </Button>
                    <Button size="sm" onClick={() => updateSignatory(s.id, { active: s.active === false })}>
                      {s.active === false ? "Aktif et" : "Pasif"}
                    </Button>
                    <Button size="sm" variant="warn" onClick={() => removeSignatory(s.id)}>
                      Sil
                    </Button>
                  </div>
                </div>
              ))}
            <Button onClick={() => addSignatory()}>Yetkili ekle</Button>
          </div>
        </Card>

        <Card title="Resmi tatiller">
          <div className="mb-3 flex flex-wrap gap-2">
            <Button onClick={() => seedHolidays(new Date().getFullYear())}>Bu yılın resmi tatillerini ekle</Button>
          </div>
          <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input
              placeholder="Tatil adı"
              value={holidayName}
              onChange={(e) => setHolidayName(e.target.value)}
            />
            <Input type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} />
            <Button
              onClick={() => {
                if (!holidayName.trim() || !holidayDate) return;
                addHoliday({ date: holidayDate, name: holidayName.trim(), kind: "custom", halfDay: false });
                setHolidayName("");
                setHolidayDate("");
              }}
            >
              Ekle
            </Button>
          </div>
          <ul className="max-h-40 space-y-1 overflow-auto text-sm">
            {[...state.holidays]
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-2 border-t border-rule py-1">
                  <span>
                    <span className="font-mono text-xs">{h.date}</span> · {h.name}
                    <span className="text-ink-soft"> ({HOLIDAY_KIND_LABEL[h.kind]})</span>
                  </span>
                  <Button size="sm" onClick={() => removeHoliday(h.id)}>
                    Sil
                  </Button>
                </li>
              ))}
          </ul>
        </Card>

        <Card title="Yedek">
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                const next = await importBackupFile(file);
                replaceState(next);
                setMessage(`${file.name} yüklendi. Personel, izin, ayar ve imza kayıtları geldi.`);
              } catch {
                setMessage("Dosya okunamadı. Kaydet veya Dışa aktar ile indirdiğin JSON yedeğini seç.");
              }
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => fileRef.current?.click()}>İçe aktar</Button>
            <Button
              variant="warn"
              onClick={() => {
                if (confirm("Tüm personel, izin ve elle değişiklikler silinsin mi?")) resetDemo();
              }}
            >
              Personeli temizle
            </Button>
          </div>
          {message ? <p className="mt-2 text-sm text-ok">{message}</p> : null}
        </Card>
      </div>
    </div>
  );
}
