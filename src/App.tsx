import { useRef, useState } from "react";
import { CalendarDays, FileDown, Save, Settings, Upload, Users, Umbrella } from "lucide-react";
import type { PageId } from "./types";
import { cn } from "./lib/cn";
import { currentMonth } from "./lib/dates";
import { downloadText } from "./lib/backup";
import { exportExcel } from "./lib/exportExcel";
import { exportPdf } from "./lib/exportPdf";
import { scheduleForMonth } from "./lib/schedule";
import { exportJson, importJson } from "./lib/storage";
import { EmployeesPage } from "./pages/EmployeesPage";
import { LeavesPage } from "./pages/LeavesPage";
import { SchedulePage } from "./pages/SchedulePage";
import { SettingsPage } from "./pages/SettingsPage";
import { StoreProvider, useStore } from "./state/store";
import { Button } from "./ui/controls";

const NAV: { id: PageId; label: string; icon: typeof CalendarDays }[] = [
  { id: "schedule", label: "Çizelge", icon: CalendarDays },
  { id: "employees", label: "Personel", icon: Users },
  { id: "leaves", label: "İzinler", icon: Umbrella },
  { id: "settings", label: "Ayarlar", icon: Settings },
];

function Shell() {
  const { state, replaceState } = useStore();
  const [page, setPage] = useState<PageId>("schedule");
  const [{ year, month }, setMonth] = useState(currentMonth);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const flash = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(null), 3500);
  };

  const onExcel = async () => {
    try {
      const result = scheduleForMonth(state, year, month);
      await exportExcel(state, result, year, month);
    } catch {
      flash("Excel oluşturulamadı.");
    }
  };

  const onPdf = async () => {
    setPdfBusy(true);
    try {
      const result = scheduleForMonth(state, year, month);
      exportPdf(state, result, year, month);
    } catch {
      flash("PDF oluşturulamadı.");
    } finally {
      setPdfBusy(false);
    }
  };

  const onSave = async () => {
    setSaveBusy(true);
    try {
      downloadText("nobet-defteri-kayit.json", exportJson(state));
      flash("Sistem kaydı indirildi (nobet-defteri-kayit.json). Önbellek silinirse İçe aktar ile bu dosyayı yükle.");
    } catch {
      flash("Kayıt indirilemedi.");
    } finally {
      setSaveBusy(false);
    }
  };

  const onExport = () => {
    try {
      downloadText("nobet-defteri-yedek.json", exportJson(state));
      flash("Yedek indirildi. Önbellek silinirse İçe aktar ile bu JSON dosyasını geri yükle.");
    } catch {
      flash("Dışa aktarılamadı.");
    }
  };

  return (
    <div className="min-h-svh bg-paper text-ink">
      <header className="no-print border-b border-rule bg-[#14110e] text-paper">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#e8b86d]">Nöbet Defteri</p>
            <h1 className="text-lg font-semibold sm:text-xl">{state.settings.workplaceName}</h1>
          </div>
          <nav className="flex flex-wrap gap-1">
            {NAV.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPage(item.id)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm",
                    page === item.id ? "bg-white/20 text-paper" : "text-[#cbbba8] hover:bg-white/10 hover:text-paper",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={onExcel}>
              <FileDown className="size-4" /> Excel
            </Button>
            <Button variant="ghost" disabled={pdfBusy} onClick={onPdf}>
              {pdfBusy ? "PDF hazırlanıyor…" : "PDF"}
            </Button>
            <Button variant="ghost" disabled={saveBusy} onClick={onSave}>
              <Save className="size-4" /> Kaydet
            </Button>
            <Button variant="ghost" onClick={onExport}>
              Dışa aktar
            </Button>
            <Button variant="ghost" onClick={() => importRef.current?.click()}>
              <Upload className="size-4" /> İçe aktar
            </Button>
            <input
              ref={importRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  replaceState(importJson(await file.text()));
                  flash(`${file.name} yüklendi. Personel, izin, ayar ve imza kayıtları geldi.`);
                } catch {
                  flash("Dosya okunamadı. Kaydet veya Dışa aktar ile indirdiğin JSON yedeğini seç.");
                }
              }}
            />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 sm:py-6">
        {page === "schedule" ? (
          <SchedulePage year={year} month={month} onMonth={(y, m) => setMonth({ year: y, month: m })} />
        ) : null}
        {page === "employees" ? <EmployeesPage /> : null}
        {page === "leaves" ? <LeavesPage year={year} /> : null}
        {page === "settings" ? <SettingsPage /> : null}
      </main>
      {toast ? (
        <div className="no-print fixed bottom-4 right-4 z-50 max-w-md rounded-lg border border-rule bg-ink px-4 py-3 text-sm text-paper shadow-xl">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
