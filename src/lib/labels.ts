import type { Employee, EmployeeTag, IsoDate, Shift } from "../types";
import { SHIFT_LABEL, SOURCE_LABEL } from "./storage";
import { LEAVE_LABEL } from "./leaves";
import type { Cell } from "../types";

export function tagsFor(employee: Employee, tags: EmployeeTag[]) {
  const ids = employee.tagIds ?? [];
  return tags.filter((t) => ids.includes(t.id));
}

export function orderedEmployees(employees: Employee[]) {
  return employees.slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name, "tr"));
}

export function groupedEmployees(employees: Employee[]) {
  return (["male", "female"] as const).map((gender) => ({
    gender,
    list: orderedEmployees(employees.filter((e) => e.gender === gender)),
  }));
}

export function cellClass(cell: Cell) {
  if (cell.shift === "morning") return "bg-morning-bg text-morning";
  if (cell.shift === "night") return "bg-night text-paper";
  if (cell.shift === "leave") {
    if (cell.leaveType === "report") return "bg-[#f4d4d0] text-warn";
    if (cell.leaveType === "rest") return "bg-[#d7ece6] text-[#1c5c4a]";
    if (cell.leaveType === "unpaid") return "bg-[#e4dfd6] text-[#5c5346]";
    if (cell.leaveType === "daily") return "bg-[#d6e4f5] text-[#1c3f70]";
    if (cell.leaveType === "annual") return "bg-leave-bg text-leave";
    return "bg-[#f3ddc4] text-[#8a4b12]";
  }
  return "text-ink-soft";
}

export function leaveSwatch(type: string) {
  if (type === "annual") return "bg-leave-bg text-leave";
  if (type === "normal") return "bg-[#f3ddc4] text-[#8a4b12]";
  if (type === "daily") return "bg-[#d6e4f5] text-[#1c3f70]";
  if (type === "report") return "bg-[#f4d4d0] text-warn";
  if (type === "rest") return "bg-[#d7ece6] text-[#1c5c4a]";
  if (type === "unpaid") return "bg-[#e4dfd6] text-[#5c5346]";
  return "border border-rule text-ink-soft";
}

export function cellTitle(cell: Cell | undefined, holidayName?: string) {
  if (!cell) return holidayName ? `Resmi tatil: ${holidayName}` : "";
  const parts = [
    cell.shift === "leave" && cell.leaveType ? LEAVE_LABEL[cell.leaveType] : SHIFT_LABEL[cell.shift],
    SOURCE_LABEL[cell.source],
  ];
  if (cell.original !== cell.shift) parts.push(`öneri: ${SHIFT_LABEL[cell.original]}`);
  if (holidayName) parts.push(`RT: ${holidayName}`);
  return parts.join(" · ");
}

export function formatGapDates(dates: IsoDate[], monthNames: readonly string[]) {
  return dates
    .map((iso) => {
      const parts = iso.split("-").map(Number);
      const month = parts[1] ?? 1;
      const day = parts[2];
      return `${day} ${monthNames[month - 1]}`;
    })
    .join(" · ");
}

export type ManualIntent = Shift | "auto";
