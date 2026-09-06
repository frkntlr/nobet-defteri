function fillTargetHours(
  days: IsoDate[],
  employees: Employee[],
  cells: Record<string, Cell>,
  fills: Record<string, number>,
  leaves: AppState["leaves"],
  manuals: Map<string, Shift>,
  settings: Settings,
  pairs: Set<string>,
) {
  const target = settings.targetWorkDays;
  if (target <= 0) return;
  const active = employees.filter((e) => e.active);
  for (const person of active) {
    if (hasWeekdayFilter(person)) continue;
    const need = requiredWork(person.id, days, cells, target);
    let guard = 0;
    while (workCount(person.id, days, cells) < need && guard < days.length * 2) {
      guard += 1;
      let paired: IsoDate | null = null;
      let isolated: IsoDate | null = null;
      for (const date of days) {
        const cell = cells[cellKey(person.id, date)];
        if (!cell || locked(cell) || cell.shift !== "off") continue;
        const shift = preferredShiftForFill(person, date, active, cells, leaves, manuals, settings);
        if (!shift) continue;
        if (!canTake(person, date, shift, cells, leaves, manuals, settings)) continue;
        if (partnerClash(person.id, date, shift, cells, pairs)) continue;
        if (
          person.gender === "male" &&
          shift === "morning" &&
          countOn(date, "morning", "male", active, cells) >= settings.minMaleMorning
        ) {
          continue;
        }
        const before = streakDir(person, date, -1, cells, leaves, manuals, settings);
        const after = streakDir(person, date, 1, cells, leaves, manuals, settings);
        if (before === 1 || after === 1) {
          paired = date;
          break;
        }
        if (!isolated) isolated = date;
      }
      const date = paired ?? isolated;
      if (!date) break;
      const shift = preferredShiftForFill(person, date, active, cells, leaves, manuals, settings);
      if (!shift) break;
      assignFill(person, date, shift, cells, fills);
    }
  }
}
