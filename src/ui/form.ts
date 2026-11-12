import { parseLapTime } from "../calc/time";
import type { PlanInput } from "../calc/types";

// Reads and checks the form, shows errors next to the fields,
// and saves and restores the form in the browser (localStorage).

const TEXT_IDS = ["hours", "mins", "lap", "fuel", "tank", "startFuel", "margin", "wear", "tyreMin", "lane", "rate", "tyre", "swap", "drivers"] as const;
const CHECK_IDS = ["together", "rotate"] as const;
const STORAGE_KEY = "stint-planner-v2";

export type FieldId = (typeof TEXT_IDS)[number];
export type FieldErrors = Partial<Record<FieldId, string>>;

export interface FormRead {
  /** null when one or more fields are wrong. */
  input: PlanInput | null;
  errors: FieldErrors;
}

function field(id: string): HTMLInputElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLInputElement)) throw new Error("Missing input: " + id);
  return el;
}

/** Number from a field. Empty or invalid text gives NaN. */
function num(id: FieldId): number {
  return parseFloat(field(id).value.replace(",", "."));
}

function isEmpty(id: FieldId): boolean {
  return field(id).value.trim() === "";
}

export function readForm(): FormRead {
  const errors: FieldErrors = {};

  // A required number that must be above zero.
  const positive = (id: FieldId, what: string): number => {
    const n = num(id);
    if (!(n > 0)) errors[id] = isEmpty(id) ? "Enter " + what + "." : "Must be more than 0.";
    return n;
  };
  // An optional number that may be zero. Empty counts as zero.
  const zeroOrMore = (id: FieldId): number => {
    if (isEmpty(id)) return 0;
    const n = num(id);
    if (!(n >= 0)) errors[id] = "Cannot be negative.";
    return n;
  };

  const hours = zeroOrMore("hours");
  const mins = zeroOrMore("mins");
  const raceSeconds = hours * 3600 + mins * 60;
  if (!errors.hours && !errors.mins && !(raceSeconds > 0)) errors.hours = "Enter a race length.";

  const lapSeconds = parseLapTime(field("lap").value);
  // Under 20 seconds is almost certainly a half-typed lap time, not a real one.
  if (lapSeconds === null || lapSeconds < 20) errors.lap = "Use minutes:seconds, like 3:32.0.";

  const fuelPerLap = positive("fuel", "the fuel use");
  const tankLitres = positive("tank", "the tank size");
  // An empty start fuel field means a full tank.
  let startFuelLitres = tankLitres;
  if (!isEmpty("startFuel")) {
    startFuelLitres = num("startFuel");
    if (!(startFuelLitres > 0)) errors.startFuel = "Must be more than 0.";
    else if (tankLitres > 0 && startFuelLitres > tankLitres) errors.startFuel = "More than the tank holds.";
  }
  const marginLaps = zeroOrMore("margin");
  const tyreWearPerLap = zeroOrMore("wear");
  const tyreMinCondition = zeroOrMore("tyreMin");
  if (!errors.tyreMin && tyreMinCondition >= 100) errors.tyreMin = "Must be below 100.";
  const pitLaneLossSeconds = zeroOrMore("lane");
  const refuelRate = positive("rate", "the refuel rate");
  const tyreChangeSeconds = zeroOrMore("tyre");
  const driverSwapSeconds = zeroOrMore("swap");

  if (Object.keys(errors).length > 0 || lapSeconds === null) return { input: null, errors };

  return {
    errors,
    input: {
      raceSeconds,
      lapSeconds,
      fuelPerLap,
      tankLitres,
      marginLaps,
      startFuelLitres,
      pitLaneLossSeconds,
      refuelRate,
      tyreChangeSeconds,
      driverSwapSeconds,
      simultaneousService: field("together").checked,
      tyreWearPerLap,
      tyreMinCondition,
      drivers: field("drivers").value.split(",").map((d) => d.trim()).filter(Boolean),
      rotateDrivers: field("rotate").checked,
    },
  };
}

/** Mark wrong fields and show the reason under each one. */
export function showErrors(errors: FieldErrors): void {
  for (const id of TEXT_IDS) {
    const input = field(id);
    const label = input.closest("label");
    if (!label) continue;
    const message = errors[id];
    let note = label.querySelector<HTMLElement>(".err");
    if (message) {
      if (!note) {
        note = document.createElement("small");
        note.className = "err";
        note.id = id + "-err";
        label.append(note);
      }
      note.textContent = message;
      label.classList.add("invalid");
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", note.id);
    } else {
      note?.remove();
      label.classList.remove("invalid");
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
    }
  }
}

export function saveForm(): void {
  try {
    const data: Record<string, string | boolean> = {};
    for (const id of TEXT_IDS) data[id] = field(id).value;
    for (const id of CHECK_IDS) data[id] = field(id).checked;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage can be blocked (private window). The app still works, it just forgets.
  }
}

export function restoreForm(): void {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (typeof saved !== "object" || saved === null) return;
    const data = saved as Record<string, unknown>;
    for (const id of TEXT_IDS) {
      const v = data[id];
      if (typeof v === "string") field(id).value = v;
    }
    for (const id of CHECK_IDS) {
      const v = data[id];
      if (typeof v === "boolean") field(id).checked = v;
    }
  } catch {
    // Unreadable saved data: keep the defaults.
  }
}

/** Put every field back to the value written in index.html. */
export function resetForm(): void {
  for (const id of TEXT_IDS) field(id).value = field(id).defaultValue;
  for (const id of CHECK_IDS) field(id).checked = field(id).defaultChecked;
}

/** Set the race length fields, used by the preset buttons. */
export function setRaceLength(hours: number): void {
  field("hours").value = String(hours);
  field("mins").value = "0";
}

/** Race length as typed, in minutes. NaN when the fields are not valid numbers. */
export function raceLengthMinutes(): number {
  const h = isEmpty("hours") ? 0 : num("hours");
  const m = isEmpty("mins") ? 0 : num("mins");
  return h * 60 + m;
}
