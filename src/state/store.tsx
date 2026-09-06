import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  AppState,
  Employee,
  EmployeeDraft,
  EmployeeTag,
  Holiday,
  IsoDate,
  LeaveRecord,
  LeaveType,
  Settings,
  Shift,
  Signatory,
} from "../types";
import { uid } from "../lib/cn";
import { LEAVE_META } from "../lib/leaves";
import { balanceOffsets, bestOffsetFor } from "../lib/schedule";
import { hasPair, makePair } from "../lib/separations";
import { emptyState, loadState, saveState } from "../lib/storage";
import { mergeHolidays } from "../lib/holidays";

type Store = {
  state: AppState;
  updateSettings: (patch: Partial<Settings>) => void;
  addEmployee: (draft: EmployeeDraft) => void;
  updateEmployee: (id: string, patch: Partial<Employee>) => void;
  removeEmployee: (id: string) => void;
  moveEmployee: (id: string, dir: -1 | 1, onlyActive?: boolean) => void;
  addSeparation: (a: string, b: string) => void;
  removeSeparation: (id: string) => void;
  addLeave: (leave: Omit<LeaveRecord, "id">) => void;
  updateLeave: (id: string, patch: Partial<LeaveRecord>) => void;
  removeLeave: (id: string) => void;
  setDayLeave: (employeeId: string, date: IsoDate, type: LeaveType | null) => void;
  addHoliday: (holiday: Omit<Holiday, "id">) => void;
  updateHoliday: (id: string, patch: Partial<Holiday>) => void;
  removeHoliday: (id: string) => void;
  seedHolidays: (year: number) => void;
  addSignatory: (partial?: Partial<Pick<Signatory, "name" | "position" | "active">>) => void;
  updateSignatory: (id: string, patch: Partial<Signatory>) => void;
  removeSignatory: (id: string) => void;
  moveSignatory: (id: string, dir: -1 | 1) => void;
  addTag: (name: string) => EmployeeTag | null;
  updateTag: (id: string, name: string) => void;
  removeTag: (id: string) => void;
  setManual: (employeeId: string, date: IsoDate, shift: Shift | null) => void;
  clearManuals: () => void;
  rebalance: () => void;
  resetDemo: () => void;
  replaceState: (next: AppState) => void;
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => loadState());

  useEffect(() => {
    saveState(state);
  }, [state]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setState((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
  }, []);

  const addEmployee = useCallback((draft: EmployeeDraft) => {
    setState((prev) => {
      const employee: Employee = {
        id: uid(),
        name: draft.name,
        gender: draft.gender,
        pattern: draft.pattern,
        cycleOffset: draft.cycleOffset,
        autoOffset: draft.autoOffset,
        workDays: draft.workDays,
        offDays: draft.offDays,
        workWeekdays: draft.workWeekdays,
        annualLeaveDays: draft.annualLeaveDays,
        active: true,
        notes: draft.notes,
        tagIds: draft.tagIds ?? [],
        sort: prev.employees.reduce((m, e) => Math.max(m, e.sort ?? 0), -1) + 1,
      };
      employee.cycleOffset = bestOffsetFor(employee, prev.employees, prev.settings, prev.separations);
      const extra = draft.separateFrom
        .map((id) => makePair(employee.id, id))
        .filter((p): p is NonNullable<typeof p> => p !== null)
        .filter((p) => !hasPair(prev.separations, p.employeeIdA, p.employeeIdB))
        .map((p) => ({ id: uid(), ...p }));
      return {
        ...prev,
        employees: [...prev.employees, employee],
        separations: [...prev.separations, ...extra],
      };
    });
  }, []);

  const updateEmployee = useCallback((id: string, patch: Partial<Employee>) => {
    setState((prev) => ({
      ...prev,
      employees: prev.employees.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
  }, []);

  const moveEmployee = useCallback((id: string, dir: -1 | 1, onlyActive = false) => {
    setState((prev) => {
      const ordered = [...prev.employees]
        .filter((e) => (onlyActive ? e.active : true))
        .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name, "tr"));
      const i = ordered.findIndex((e) => e.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ordered.length) return prev;
      const a = ordered[i];
      const b = ordered[j];
      if (!a || !b) return prev;
      const sortA = a.sort ?? i;
      const sortB = b.sort ?? j;
      return {
        ...prev,
        employees: prev.employees.map((e) =>
          e.id === a.id ? { ...e, sort: sortB } : e.id === b.id ? { ...e, sort: sortA } : e,
        ),
      };
    });
  }, []);

  const removeEmployee = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      employees: prev.employees.filter((e) => e.id !== id),
      leaves: prev.leaves.filter((l) => l.employeeId !== id),
      manuals: prev.manuals.filter((m) => m.employeeId !== id),
      separations: prev.separations.filter((s) => s.employeeIdA !== id && s.employeeIdB !== id),
    }));
  }, []);

  const addSeparation = useCallback((a: string, b: string) => {
    setState((prev) => {
      const pair = makePair(a, b);
      if (!pair || hasPair(prev.separations, pair.employeeIdA, pair.employeeIdB)) return prev;
      return { ...prev, separations: [...prev.separations, { id: uid(), ...pair }] };
    });
  }, []);

  const removeSeparation = useCallback((id: string) => {
    setState((prev) => ({ ...prev, separations: prev.separations.filter((s) => s.id !== id) }));
  }, []);

  const addLeave = useCallback((leave: Omit<LeaveRecord, "id">) => {
    setState((prev) => ({ ...prev, leaves: [...prev.leaves, { ...leave, id: uid() }] }));
  }, []);

  const updateLeave = useCallback((id: string, patch: Partial<LeaveRecord>) => {
    setState((prev) => ({
      ...prev,
      leaves: prev.leaves.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));
  }, []);

  const removeLeave = useCallback((id: string) => {
    setState((prev) => ({ ...prev, leaves: prev.leaves.filter((l) => l.id !== id) }));
  }, []);

  const setDayLeave = useCallback((employeeId: string, date: IsoDate, type: LeaveType | null) => {
    setState((prev) => {
      const manuals = prev.manuals.filter((m) => m.employeeId !== employeeId || m.date !== date);
      if (type === null) {
        return {
          ...prev,
          manuals,
          leaves: prev.leaves.filter(
            (l) => l.employeeId !== employeeId || l.startDate !== date || l.endDate !== date,
          ),
        };
      }
      const existing = prev.leaves.find(
        (l) => l.employeeId === employeeId && l.startDate === date && l.endDate === date,
      );
      if (existing) {
        return {
          ...prev,
          manuals,
          leaves: prev.leaves.map((l) => (l.id === existing.id ? { ...l, type, ...LEAVE_META[type] } : l)),
        };
      }
      const covering = prev.leaves.some(
        (l) => l.employeeId === employeeId && date >= l.startDate && date <= l.endDate,
      );
      if (covering) return { ...prev, manuals };
      return {
        ...prev,
        manuals,
        leaves: [
          ...prev.leaves,
          {
            id: uid(),
            employeeId,
            startDate: date,
            endDate: date,
            type,
            note: "",
            documentNo: "",
            institution: "",
            ...LEAVE_META[type],
          },
        ],
      };
    });
  }, []);

  const addHoliday = useCallback((holiday: Omit<Holiday, "id">) => {
    setState((prev) => ({
      ...prev,
      holidays: [...prev.holidays, { ...holiday, id: uid() }].sort((a, b) => a.date.localeCompare(b.date)),
    }));
  }, []);

  const updateHoliday = useCallback((id: string, patch: Partial<Holiday>) => {
    setState((prev) => ({
      ...prev,
      holidays: prev.holidays.map((h) => (h.id === id ? { ...h, ...patch } : h)),
    }));
  }, []);

  const removeHoliday = useCallback((id: string) => {
    setState((prev) => ({ ...prev, holidays: prev.holidays.filter((h) => h.id !== id) }));
  }, []);

  const seedHolidays = useCallback((year: number) => {
    setState((prev) => ({ ...prev, holidays: mergeHolidays(prev.holidays, year) }));
  }, []);

  const addSignatory = useCallback((partial?: Partial<Pick<Signatory, "name" | "position" | "active">>) => {
    setState((prev) => {
      const sort = prev.signatories.reduce((m, s) => Math.max(m, s.sort), -1) + 1;
      return {
        ...prev,
        signatories: [
          ...prev.signatories,
          {
            id: uid(),
            name: partial?.name ?? "",
            position: partial?.position ?? "Gözetim Personeli",
            sort,
            active: partial?.active ?? true,
          },
        ],
      };
    });
  }, []);

  const addTag = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const tag: EmployeeTag = { id: uid(), name: trimmed };
    setState((prev) => {
      if (prev.tags.some((t) => t.name.toLocaleLowerCase("tr") === trimmed.toLocaleLowerCase("tr"))) return prev;
      return { ...prev, tags: [...prev.tags, tag] };
    });
    return tag;
  }, []);

  const updateTag = useCallback((id: string, name: string) => {
    setState((prev) => ({
      ...prev,
      tags: prev.tags.map((t) => (t.id === id ? { ...t, name } : t)),
    }));
  }, []);

  const removeTag = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => t.id !== id),
      employees: prev.employees.map((e) => ({
        ...e,
        tagIds: (e.tagIds ?? []).filter((tagId) => tagId !== id),
      })),
    }));
  }, []);

  const updateSignatory = useCallback((id: string, patch: Partial<Signatory>) => {
    setState((prev) => ({
      ...prev,
      signatories: prev.signatories.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  }, []);

  const removeSignatory = useCallback((id: string) => {
    setState((prev) => ({ ...prev, signatories: prev.signatories.filter((s) => s.id !== id) }));
  }, []);

  const moveSignatory = useCallback((id: string, dir: -1 | 1) => {
    setState((prev) => {
      const ordered = [...prev.signatories].sort((a, b) => a.sort - b.sort);
      const i = ordered.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ordered.length) return prev;
      const a = ordered[i];
      const b = ordered[j];
      if (!a || !b) return prev;
      return {
        ...prev,
        signatories: prev.signatories.map((s) =>
          s.id === a.id ? { ...s, sort: b.sort } : s.id === b.id ? { ...s, sort: a.sort } : s,
        ),
      };
    });
  }, []);

  const setManual = useCallback((employeeId: string, date: IsoDate, shift: Shift | null) => {
    setState((prev) => {
      const manuals = prev.manuals.filter((m) => m.employeeId !== employeeId || m.date !== date);
      return { ...prev, manuals: shift === null ? manuals : [...manuals, { employeeId, date, shift }] };
    });
  }, []);

  const clearManuals = useCallback(() => {
    setState((prev) => ({ ...prev, manuals: [] }));
  }, []);

  const rebalance = useCallback(() => {
    setState((prev) => ({
      ...prev,
      employees: balanceOffsets(prev.employees, prev.settings, prev.separations),
    }));
  }, []);

  const resetDemo = useCallback(() => {
    setState((prev) => ({
      ...prev,
      employees: [],
      leaves: [],
      manuals: [],
      separations: [],
    }));
  }, []);

  const replaceState = useCallback((next: AppState) => {
    setState(next);
  }, []);

  const value = useMemo<Store>(
    () => ({
      state,
      updateSettings,
      addEmployee,
      updateEmployee,
      removeEmployee,
      moveEmployee,
      addSeparation,
      removeSeparation,
      addLeave,
      updateLeave,
      removeLeave,
      setDayLeave,
      addHoliday,
      updateHoliday,
      removeHoliday,
      seedHolidays,
      addSignatory,
      updateSignatory,
      removeSignatory,
      moveSignatory,
      addTag,
      updateTag,
      removeTag,
      setManual,
      clearManuals,
      rebalance,
      resetDemo,
      replaceState,
    }),
    [
      state,
      updateSettings,
      addEmployee,
      updateEmployee,
      removeEmployee,
      moveEmployee,
      addSeparation,
      removeSeparation,
      addLeave,
      updateLeave,
      removeLeave,
      setDayLeave,
      addHoliday,
      updateHoliday,
      removeHoliday,
      seedHolidays,
      addSignatory,
      updateSignatory,
      removeSignatory,
      moveSignatory,
      addTag,
      updateTag,
      removeTag,
      setManual,
      clearManuals,
      rebalance,
      resetDemo,
      replaceState,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("StoreProvider missing");
  return ctx;
}

export { emptyState };
