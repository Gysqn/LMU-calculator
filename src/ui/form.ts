import { parseLapTime } from "../calc/time";
import type { PlanInput } from "../calc/types";
import { DEFAULT_DRIVERS, driverBoxes, driverNames, setDriverBoxes } from "./drivers";

// Reads and checks the form, shows errors next to the fields,
// and saves and restores the form in the browser (localStorage).

const TEXT_IDS = ["hours", "mins", "lapMin", "lapSec", "fuel", "tank", "startFuel", "margin", "wear", "wearLaps", "tyreMin", "tyreSets", "lane", "rate", "tyre", "swap"] as const;
const CHECK_IDS = ["fullTank", "tyresOn", "limitSets", "together", "rotate"] as const;
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

function checked(id: (typeof CHECK_IDS)[number]): boolean {
  return field(id).checked;
}

/** Number from a field. Empty or invalid text gives NaN. */
function num(id: FieldId): number {
  return parseFloat(field(id).value.replace(",", "."));
}

function isEmpty(id: FieldId): boolean {
  return field(id).value.trim() === "";
}

/** Show or hide a field together with its label. */
function show(id: string, visible: boolean): void {
  const el = document.getElementById(id);
  const target = el instanceof HTMLInputElement ? el.closest("label") : el;
  if (target instanceof HTMLElement) target.hidden = !visible;
}

function isSwapping(): boolean {
  return driverBoxes().length > 1 && checked("rotate");
}

/** Only show the fields that matter for the current choices. */
export function syncVisibility(): void {
  const tyres = checked("tyresOn");
  show("startFuel", !checked("fullTank"));
  show("wear", tyres);
  show("wearLaps", tyres);
  show("limitSets", tyres);
  show("tyreSets", tyres && checked("limitSets"));
  show("tyreMin", tyres);
  show("tyreHint", tyres);
  show("tyre", tyres);
  show("together", tyres);
  show("togetherHint", tyres);
  show("rotate", driverBoxes().length > 1);
  show("swap", isSwapping());
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

  // A required whole number of at least 1, such as a number of laps.
  const wholeNumber = (id: FieldId, what: string): number => {
    const text = field(id).value.trim();
    const n = Number(text);
    if (text === "") errors[id] = "Enter " + what + ".";
    else if (!Number.isInteger(n)) errors[id] = "Use a whole number.";
    else if (n < 1) errors[id] = "Must be at least 1.";
    return n;
  };

  const raceSeconds = zeroOrMore("hours") * 3600 + zeroOrMore("mins") * 60;
  if (!errors.hours && !errors.mins && !(raceSeconds > 0)) errors.hours = "Enter a race length.";

  const lapMin = zeroOrMore("lapMin");
  const lapSec = zeroOrMore("lapSec");
  const lapSeconds = lapMin * 60 + lapSec;
  if (!errors.lapMin && !errors.lapSec) {
    if (lapSec >= 60) errors.lapSec = "Must be below 60.";
    else if (lapSeconds === 0) errors.lapMin = "Enter a lap time.";
    // Under 20 seconds is almost certainly a half-typed lap time, not a real one.
    else if (lapSeconds < 20) errors.lapSec = "That lap is too short.";
  }

  const fuelPerLap = positive("fuel", "the fuel use");
  const tankLitres = positive("tank", "the tank size");
  let startFuelLitres = tankLitres;
  if (!checked("fullTank")) {
    startFuelLitres = positive("startFuel", "the start fuel");
    if (startFuelLitres > 0 && tankLitres > 0 && startFuelLitres > tankLitres) errors.startFuel = "More than the tank holds.";
  }
  const marginLaps = zeroOrMore("margin");

  // With tyre changes switched off, wear is 0: the calculation then never changes tyres.
  let tyreWearPerLap = 0;
  let tyreMinCondition = 0;
  let tyreChangeSeconds = 0;
  let maxTyreSets: number | null = null;
  if (checked("tyresOn")) {
    // Wear is typed as whole percent over a few laps, because that is what you can read in the game.
    // The calculation works with wear per lap.
    tyreWearPerLap = wholeNumber("wear", "the wear") / wholeNumber("wearLaps", "the laps");
    if (checked("limitSets")) maxTyreSets = wholeNumber("tyreSets", "the number of sets");
    tyreMinCondition = zeroOrMore("tyreMin");
    if (!errors.tyreMin && tyreMinCondition >= 100) errors.tyreMin = "Must be below 100.";
    tyreChangeSeconds = zeroOrMore("tyre");
  }

  const pitLaneLossSeconds = zeroOrMore("lane");
  const refuelRate = positive("rate", "the refuel rate");
  const driverSwapSeconds = isSwapping() ? zeroOrMore("swap") : 0;

  if (Object.keys(errors).length > 0) return { input: null, errors };

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
      simultaneousService: checked("together"),
      tyreWearPerLap,
      tyreMinCondition,
      maxTyreSets,
      drivers: driverNames(),
      rotateDrivers: checked("rotate"),
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
    const data: Record<string, string | boolean | string[]> = {};
    for (const id of TEXT_IDS) data[id] = field(id).value;
    for (const id of CHECK_IDS) data[id] = checked(id);
    data.drivers = driverBoxes();
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

    // Data saved by an earlier version of the app looked a little different.
    if (typeof data.lap === "string" && data.lapMin === undefined) {
      const seconds = parseLapTime(data.lap);
      if (seconds !== null) {
        const minutes = Math.floor(seconds / 60);
        field("lapMin").value = String(minutes);
        field("lapSec").value = String(Math.round((seconds - minutes * 60) * 1000) / 1000);
      }
    }
    if (typeof data.wear === "string" && data.wearLaps === undefined) {
      // Wear used to be saved per lap. It is now whole percent over 3 laps.
      const perLap = parseFloat(data.wear);
      if (perLap > 0) field("wear").value = String(Math.max(1, Math.round(perLap * 3)));
      else field("tyresOn").checked = false;
    }
    if (data.fullTank === undefined) field("fullTank").checked = field("startFuel").value.trim() === "";
    if (Array.isArray(data.drivers)) {
      setDriverBoxes(data.drivers.filter((d): d is string => typeof d === "string"));
    } else if (typeof data.drivers === "string") {
      setDriverBoxes(data.drivers.split(",").map((d) => d.trim()).filter(Boolean));
    }
  } catch {
    // Unreadable saved data: keep the defaults.
  }
}

/** Put every field back to the value written in index.html. */
export function resetForm(): void {
  for (const id of TEXT_IDS) field(id).value = field(id).defaultValue;
  for (const id of CHECK_IDS) field(id).checked = field(id).defaultChecked;
  setDriverBoxes(DEFAULT_DRIVERS);
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
