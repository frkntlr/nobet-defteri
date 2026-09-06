import type { AppState, Employee, Holiday, LeaveRecord, ManualCell, Separation, Settings, Signatory } from "../types";
import { uid } from "./cn";
import { officialHolidays, mergeHolidays } from "./holidays";
import { LEAVE_META, LEAVE_TYPES } from "./leaves";
import type { LeaveType } from "../types";
import { makePair } from "./separations";

export const STORAGE_KEY = "nobet-defteri-v1";
export const STORE_VERSION = 5;

export const DEFAULT_SETTINGS: Settings = {
  workplaceName: "Nöbet Defteri",
  morningStart: "07:00",
  morningEnd: "19:00",
  nightStart: "19:00",
  nightEnd: "07:00",
  workDays: 2,
  offDays: 2,
  rotateShifts: true,
  minMorning: 0,
  minNight: 0,
  minMaleMorning: 1,
  minMaleNight: 1,
  preferMaleNight: 2,
  minFemaleMorning: 1,
  minFemaleNight: 1,
  autoFillFemale: false,
  targetWorkDays: 15,
  cycleAnchor: "2026-01-05",
  shiftHours: 12,
  annualLeaveDays: 14,
  workOnHolidays: true,
  showHolidays: true,
};

export const SIGNATORY_ROLES = [
  "Yurt Müdürü",
  "Müdür Yardımcısı",
  "Gözetim Personeli",
  "Nöbet Amiri",
  "Vardiya Sorumlusu",
];

export function defaultSignatories(): Signatory[] {
  return [
    { id: uid(), name: "", position: "Yurt Müdürü", sort: 0 },
    { id: uid(), name: "", position: "Gözetim Personeli", sort: 1 },
  ];
}

export function emptyState(): AppState {
  return {
    version: STORE_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    employees: [],
    leaves: [],
    holidays: officialHolidays(new Date().getFullYear()),
    manuals: [],
    signatories: defaultSignatories(),
    separations: [],
  };
}

function isObj(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asBool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function asNum(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.max(0, n);
  }
  return fallback;
}

function parseGender(value: unknown) {
  const t = String(value ?? "")
    .trim()
    .toLocaleLowerCase("tr");
  if (["male", "erkek", "e", "m", "man"].includes(t)) return "male" as const;
  if (["female", "bayan", "kadın", "kadin", "k", "f", "woman"].includes(t)) return "female" as const;
  return null;
}

function parseLeaveType(value: unknown): LeaveType {
  const raw = String(value ?? "");
  if (raw === "excuse" || raw === "mazeret") return "normal";
  if (raw === "sick" || raw === "rapor") return "report";
  return LEAVE_TYPES.includes(raw as LeaveType) ? (raw as LeaveType) : "normal";
}

function parseSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  if (!isObj(raw)) return { ...d };
  const hasGenderMins = raw.minMaleMorning != null || raw.minFemaleMorning != null;
  return {
    workplaceName: String(raw.workplaceName ?? d.workplaceName),
    morningStart: String(raw.morningStart ?? d.morningStart),
    morningEnd: String(raw.morningEnd ?? d.morningEnd),
    nightStart: String(raw.nightStart ?? d.nightStart),
    nightEnd: String(raw.nightEnd ?? d.nightEnd),
    workDays: Number(raw.workDays ?? d.workDays) || d.workDays,
    offDays: Number(raw.offDays ?? d.offDays) || d.offDays,
    rotateShifts: asBool(raw.rotateShifts, d.rotateShifts),
    minMorning: hasGenderMins ? asNum(raw.minMorning, 0) : 0,
    minNight: hasGenderMins ? asNum(raw.minNight, 0) : 0,
    minMaleMorning: asNum(raw.minMaleMorning, d.minMaleMorning),
    minMaleNight: Math.max(1, asNum(raw.minMaleNight, d.minMaleNight)),
    preferMaleNight: asNum(raw.preferMaleNight, d.preferMaleNight),
    minFemaleMorning: asNum(raw.minFemaleMorning, d.minFemaleMorning),
    minFemaleNight: asNum(raw.minFemaleNight, d.minFemaleNight),
    autoFillFemale: asBool(raw.autoFillFemale, d.autoFillFemale),
    targetWorkDays: asNum(raw.targetWorkDays, d.targetWorkDays),
    cycleAnchor: String(raw.cycleAnchor ?? d.cycleAnchor),
    shiftHours: Number(raw.shiftHours ?? d.shiftHours) || d.shiftHours,
    annualLeaveDays: Number(raw.annualLeaveDays ?? d.annualLeaveDays) || d.annualLeaveDays,
    workOnHolidays: asBool(raw.workOnHolidays, true),
    showHolidays: asBool(raw.showHolidays, true),
  };
}

function parseEmployee(raw: unknown): Employee | null {
  if (!isObj(raw) || typeof raw.id !== "string" || typeof raw.name !== "string") return null;
  const pattern =
    raw.pattern === "fixed_morning" || raw.pattern === "fixed_night" || raw.pattern === "selected_morning"
      ? raw.pattern
      : "rotating";
  const weekdays = Array.isArray(raw.workWeekdays)
    ? [...new Set(raw.workWeekdays.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort(
        (a, b) => a - b,
      )
    : [];
  return {
    id: raw.id,
    name: raw.name,
    gender: parseGender(raw.gender) ?? "male",
    pattern,
    cycleOffset: Number(raw.cycleOffset ?? 0) || 0,
    autoOffset: asBool(raw.autoOffset, true),
    workDays: typeof raw.workDays === "number" ? raw.workDays : null,
    offDays: typeof raw.offDays === "number" ? raw.offDays : null,
    workWeekdays: weekdays,
    annualLeaveDays: typeof raw.annualLeaveDays === "number" ? raw.annualLeaveDays : null,
    active: asBool(raw.active, true),
    notes: String(raw.notes ?? ""),
  };
}

function parseLeave(raw: unknown): LeaveRecord | null {
  if (!isObj(raw) || typeof raw.id !== "string" || typeof raw.employeeId !== "string") return null;
  const type = parseLeaveType(raw.type);
  const meta = LEAVE_META[type];
  return {
    id: raw.id,
    employeeId: raw.employeeId,
    startDate: String(raw.startDate ?? ""),
    endDate: String(raw.endDate ?? raw.startDate ?? ""),
    type,
    note: String(raw.note ?? ""),
    documentNo: String(raw.documentNo ?? ""),
    institution: String(raw.institution ?? ""),
    paid: typeof raw.paid === "boolean" ? raw.paid : meta.paid,
    countsTowardAnnual:
      typeof raw.countsTowardAnnual === "boolean" ? raw.countsTowardAnnual : meta.countsTowardAnnual,
  };
}

function parseSignatory(raw: unknown): Signatory | null {
  if (!isObj(raw) || typeof raw.id !== "string") return null;
  return {
    id: raw.id,
    name: String(raw.name ?? ""),
    position: String(raw.position ?? "Gözetim Personeli"),
    sort: Number(raw.sort ?? 0) || 0,
  };
}

function parseSeparation(raw: unknown, ids: Set<string>): Separation | null {
  if (!isObj(raw)) return null;
  const a = String(raw.employeeIdA ?? "");
  const b = String(raw.employeeIdB ?? "");
  const pair = makePair(a, b);
  if (!pair || !ids.has(pair.employeeIdA) || !ids.has(pair.employeeIdB)) return null;
  return { id: typeof raw.id === "string" ? raw.id : uid(), ...pair };
}

function parseManual(raw: unknown): ManualCell | null {
  if (!isObj(raw) || typeof raw.employeeId !== "string" || typeof raw.date !== "string") return null;
  const shift = raw.shift;
  if (shift !== "morning" && shift !== "night" && shift !== "off" && shift !== "leave") return null;
  return { employeeId: raw.employeeId, date: raw.date, shift };
}

export function parseState(raw: unknown): AppState {
  const fallback = emptyState();
  if (!isObj(raw)) return fallback;
  const employees = Array.isArray(raw.employees)
    ? raw.employees.map(parseEmployee).filter((e): e is Employee => e !== null)
    : fallback.employees;
  const leaves = Array.isArray(raw.leaves)
    ? raw.leaves.map(parseLeave).filter((e): e is LeaveRecord => e !== null && !!e.startDate)
    : fallback.leaves;
  let holidays = Array.isArray(raw.holidays)
    ? raw.holidays
        .map((h): Holiday | null => {
          if (!isObj(h) || typeof h.date !== "string") return null;
          const kind: Holiday["kind"] =
            h.kind === "religious" || h.kind === "eve" || h.kind === "custom" ? h.kind : "national";
          return {
            id: typeof h.id === "string" ? h.id : uid(),
            date: h.date,
            name: String(h.name ?? "Tatil"),
            kind,
            halfDay: Boolean(h.halfDay),
          };
        })
        .filter((h): h is Holiday => h !== null)
    : [];
  if (holidays.length === 0) holidays = mergeHolidays([], new Date().getFullYear());
  const manuals = Array.isArray(raw.manuals)
    ? raw.manuals.map(parseManual).filter((m): m is ManualCell => m !== null)
    : [];
  const signatories = Array.isArray(raw.signatories)
    ? raw.signatories.map(parseSignatory).filter((s): s is Signatory => s !== null)
    : defaultSignatories();
  const ids = new Set(employees.map((e) => e.id));
  const separations = Array.isArray(raw.separations)
    ? raw.separations.map((s) => parseSeparation(s, ids)).filter((s): s is Separation => s !== null)
    : [];
  return {
    version: STORE_VERSION,
    settings: parseSettings(raw.settings),
    employees,
    leaves,
    holidays,
    manuals,
    signatories: signatories.length > 0 ? signatories : defaultSignatories(),
    separations,
  };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseState(JSON.parse(raw)) : emptyState();
  } catch {
    return emptyState();
  }
}

export function saveState(state: AppState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function exportJson(state: AppState) {
  return JSON.stringify({ ...state, version: STORE_VERSION, exportedAt: new Date().toISOString() }, null, 2);
}

export function importJson(text: string) {
  return parseState(JSON.parse(text));
}

export const GENDER_LABEL = { male: "Erkek", female: "Bayan" } as const;
export const SECTION_LABEL = { male: "Erkek bölümü", female: "Bayan bölümü" } as const;
export const PATTERN_LABEL = {
  rotating: "Dönen (2 iş / 2 off)",
  fixed_morning: "Sabit sabah",
  fixed_night: "Sabit gece",
  selected_morning: "Seçili günler (sabah) — gün seç",
} as const;
export const SHIFT_LABEL = {
  morning: "Sabah",
  night: "Gece",
  off: "Off",
  leave: "İzin",
} as const;
export const SOURCE_LABEL = {
  manual: "elle",
  leave: "izin kaydı",
  fill: "yedek",
  adjust: "denge",
  auto: "otomatik",
} as const;

export const NAME_PLACEHOLDERS = [
  "Ahmet Yılmaz",
  "Elif Demir",
  "Mehmet Kaya",
  "Ayşe Çelik",
  "Can Özkan",
  "Zeynep Arslan",
  "Hasan Koç",
  "Fatma Şahin",
];
