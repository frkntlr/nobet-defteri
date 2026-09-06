export type Gender = "male" | "female";
export type Pattern = "rotating" | "fixed_morning" | "fixed_night" | "selected_morning";
export type Shift = "morning" | "night" | "off" | "leave";
export type WorkShift = "morning" | "night";
export type CellSource = "auto" | "manual" | "leave" | "fill" | "adjust";
export type LeaveType = "annual" | "normal" | "daily" | "report" | "rest" | "unpaid";
export type HolidayKind = "national" | "religious" | "eve" | "custom";
export type PageId = "schedule" | "employees" | "leaves" | "settings";
export type IsoDate = string;

export type Employee = {
  id: string;
  name: string;
  gender: Gender;
  pattern: Pattern;
  cycleOffset: number;
  autoOffset: boolean;
  workDays: number | null;
  offDays: number | null;
  workWeekdays: number[];
  annualLeaveDays: number | null;
  active: boolean;
  notes: string;
};

export type LeaveRecord = {
  id: string;
  employeeId: string;
  startDate: IsoDate;
  endDate: IsoDate;
  type: LeaveType;
  note: string;
  documentNo: string;
  institution: string;
  paid: boolean;
  countsTowardAnnual: boolean;
};

export type Holiday = {
  id: string;
  date: IsoDate;
  name: string;
  kind: HolidayKind;
  halfDay: boolean;
};

export type ManualCell = {
  employeeId: string;
  date: IsoDate;
  shift: Shift;
};

export type Signatory = {
  id: string;
  name: string;
  position: string;
  sort: number;
};

export type Separation = {
  id: string;
  employeeIdA: string;
  employeeIdB: string;
};

export type Settings = {
  workplaceName: string;
  morningStart: string;
  morningEnd: string;
  nightStart: string;
  nightEnd: string;
  workDays: number;
  offDays: number;
  rotateShifts: boolean;
  minMorning: number;
  minNight: number;
  minMaleMorning: number;
  minMaleNight: number;
  preferMaleNight: number;
  minFemaleMorning: number;
  minFemaleNight: number;
  autoFillFemale: boolean;
  targetWorkDays: number;
  cycleAnchor: IsoDate;
  shiftHours: number;
  annualLeaveDays: number;
  workOnHolidays: boolean;
  showHolidays: boolean;
};

export type AppState = {
  version: number;
  settings: Settings;
  employees: Employee[];
  leaves: LeaveRecord[];
  holidays: Holiday[];
  manuals: ManualCell[];
  signatories: Signatory[];
  separations: Separation[];
};

export type Cell = {
  date: IsoDate;
  employeeId: string;
  shift: Shift;
  source: CellSource;
  original: Shift;
  leaveType?: LeaveType;
};

export type CoverageIssue = {
  date: IsoDate;
  shift: WorkShift;
  section: Gender;
  needed: number;
  actual: number;
};

export type MaleNightGap = {
  date: IsoDate;
  actual: number;
  needed: number;
  reason: "empty" | "leave" | "manual";
};

export type SeparationClash = {
  date: IsoDate;
  shift: WorkShift;
  employeeIdA: string;
  employeeIdB: string;
};

export type HourRow = {
  employeeId: string;
  workShifts: number;
  hours: number;
  leaveDays: number;
  annualDays: number;
  normalDays: number;
  dailyDays: number;
  reportDays: number;
  restDays: number;
  unpaidDays: number;
  offDays: number;
  fillShifts: number;
  holidayWorkDays: number;
  requiredWorkDays: number;
};

export type RhythmBreak = {
  employeeId: string;
  date: IsoDate;
  kind: "streak" | "short_off" | "short_work";
};

export type ScheduleResult = {
  days: IsoDate[];
  cells: Record<string, Cell>;
  issues: CoverageIssue[];
  maleNightGaps: MaleNightGap[];
  rhythmBreaks: RhythmBreak[];
  hours: HourRow[];
  separationClashes: SeparationClash[];
};

export type EmployeeDraft = {
  name: string;
  gender: Gender;
  pattern: Pattern;
  autoOffset: boolean;
  cycleOffset: number;
  workDays: number | null;
  offDays: number | null;
  workWeekdays: number[];
  annualLeaveDays: number | null;
  notes: string;
  separateFrom: string[];
};
