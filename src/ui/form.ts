import { parseLapTime } from "../calc/time";
import type { LiveState, PlanInput } from "../calc/types";
import { DEFAULT_DRIVERS, driverBoxes, driverNames, setDriverBoxes } from "./drivers";

// Reads and checks the form, shows errors next to the fields,
// and saves and restores the form in the browser (localStorage).

const TEXT_IDS = [
  "hours", "mins", "lapMin", "lapSec", "fuel", "tank", "startFuel", "margin", "wear", "wearLaps", "tyreMin", "maxTyres",
  "lane", "rate", "swap",
  // "During the race" fields:
  "leftH", "leftM", "leftS", "lapsDone", "fuelNow", "tyreNow", "tyresUsedNow",
] as const;
const CHECK_IDS = ["modeLive", "boxNow", "fullTank", "tyresOn", "limitTyres", "together", "rotate"] as const;
const STORAGE_KEY = "stint-planner-v2";

// Tyre change times in Le Mans Ultimate, as told by the user. They never change, so they are not form fields.
const CHANGE_2_TYRES_SECONDS = 6;
const CHANGE_4_TYRES_SECONDS = 12;

export type FieldId = (typeof TEXT_IDS)[number];
export type FieldErrors = Partial<Record<FieldId, string>>;

export interface FormRead {
  /** null when one or more fields are wrong. */
  input: PlanInput | null;
  /** The race as it stands now. null before the race. */
  live: LiveState | null;
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

function driverSelect(): HTMLSelectElement {
  const el = document.getElementById("driverNow");
  if (!(el instanceof HTMLSelectElement)) throw new Error("Missing select: driverNow");
  return el;
}

/** Keep the "driver in the car" list the same as the driver boxes. */
function syncDriverSelect(): void {
  const select = driverSelect();
  const names = driverNames();
  const current = [...select.options].map((o) => o.textContent ?? "");
  if (current.length === names.length && current.every((name, i) => name === names[i])) return;
  const picked = Math.max(0, select.selectedIndex);
  select.replaceChildren(...names.map((name) => new Option(name)));
  select.selectedIndex = Math.min(picked, names.length - 1);
}

export function isLive(): boolean {
  return checked("modeLive");
}

/**
 * When the user switches to "During the race" for the first time, fill the empty
 * fields with a halfway point so there is a plan to look at straight away.
 */
export function prefillLive(): void {
  const fill = (id: FieldId, value: number): void => {
    if (isEmpty(id) && Number.isFinite(value)) field(id).value = String(value);
  };
  const race = (num("hours") || 0) * 3600 + (num("mins") || 0) * 60;
  const lap = (num("lapMin") || 0) * 60 + (num("lapSec") || 0);
  const half = race / 2;
  if (isEmpty("leftH") && isEmpty("leftM") && isEmpty("leftS")) {
    fill("leftH", Math.floor(half / 3600));
    fill("leftM", Math.floor((half % 3600) / 60));
    fill("leftS", 0);
  }
  fill("lapsDone", lap > 0 ? Math.round(half / lap) : 0);
  fill("fuelNow", Math.round(num("tank") / 2));
  fill("tyreNow", 80);
  fill("tyresUsedNow", 4);
}

/** Only show the fields that matter for the current choices. */
export function syncVisibility(): void {
  const tyres = checked("tyresOn");
  const live = isLive();
  syncDriverSelect();
  show("liveBox", live);
  show("tyreNow", tyres);
  show("tyresUsedNow", tyres && checked("limitTyres"));
  show("fullTank", !live);
  show("startFuel", !live && !checked("fullTank"));
  show("wear", tyres);
  show("wearLaps", tyres);
  show("limitTyres", tyres);
  show("maxTyres", tyres && checked("limitTyres"));
  show("limitHint", tyres && checked("limitTyres"));
  show("tyreMin", tyres);
  show("tyreHint", tyres);
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

  // A required whole number, such as a number of laps.
  const wholeNumber = (id: FieldId, what: string, min = 1): number => {
    const text = field(id).value.trim();
    const n = Number(text);
    if (text === "") errors[id] = "Enter " + what + ".";
    else if (!Number.isInteger(n)) errors[id] = "Use a whole number.";
    else if (n < min) errors[id] = "Must be at least " + min + ".";
    return n;
  };
  const liveMode = isLive();

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
  // During the race the start fuel no longer matters: the fuel in the tank now is used instead.
  if (!liveMode && !checked("fullTank")) {
    startFuelLitres = positive("startFuel", "the start fuel");
    if (startFuelLitres > 0 && tankLitres > 0 && startFuelLitres > tankLitres) errors.startFuel = "More than the tank holds.";
  }
  const marginLaps = zeroOrMore("margin");

  // With tyre changes switched off, wear is 0: the calculation then never changes tyres.
  let tyreWearPerLap = 0;
  let tyreMinCondition = 0;
  let tyreChange2Seconds = 0;
  let tyreChange4Seconds = 0;
  let maxTyres: number | null = null;
  if (checked("tyresOn")) {
    // Wear is typed as whole percent over a few laps, because that is what you can read in the game.
    // The calculation works with wear per lap.
    tyreWearPerLap = wholeNumber("wear", "the wear") / wholeNumber("wearLaps", "the laps");
    if (checked("limitTyres")) {
      maxTyres = wholeNumber("maxTyres", "the number of tyres");
      if (!errors.maxTyres && maxTyres < 4) errors.maxTyres = "At least the 4 you start on.";
    }
    tyreMinCondition = zeroOrMore("tyreMin");
    if (!errors.tyreMin && tyreMinCondition >= 100) errors.tyreMin = "Must be below 100.";
    tyreChange2Seconds = CHANGE_2_TYRES_SECONDS;
    tyreChange4Seconds = CHANGE_4_TYRES_SECONDS;
  }

  const pitLaneLossSeconds = zeroOrMore("lane");
  const refuelRate = positive("rate", "the refuel rate");
  const driverSwapSeconds = isSwapping() ? zeroOrMore("swap") : 0;

  let live: LiveState | null = null;
  if (liveMode) {
    const timeLeftSeconds = zeroOrMore("leftH") * 3600 + zeroOrMore("leftM") * 60 + zeroOrMore("leftS");
    if (!errors.leftH && !errors.leftM && !errors.leftS && timeLeftSeconds > raceSeconds) {
      errors.leftH = "Longer than the race.";
    }
    const lapsDone = wholeNumber("lapsDone", "the laps", 0);
    const fuelLitres = positive("fuelNow", "the fuel");
    if (fuelLitres > 0 && tankLitres > 0 && fuelLitres > tankLitres) errors.fuelNow = "More than the tank holds.";
    let tyreCondition = 100;
    let tyresUsed = 4;
    if (checked("tyresOn")) {
      tyreCondition = positive("tyreNow", "the tyre condition");
      if (tyreCondition > 100) errors.tyreNow = "Cannot be above 100.";
      if (maxTyres !== null) {
        tyresUsed = wholeNumber("tyresUsedNow", "the tyres used", 4);
        if (!errors.tyresUsedNow && !errors.maxTyres && tyresUsed > maxTyres) errors.tyresUsedNow = "More than your limit.";
      }
    }
    live = {
      timeLeftSeconds,
      lapsDone,
      fuelLitres,
      tyreCondition,
      tyresUsed,
      driverIndex: Math.max(0, driverSelect().selectedIndex),
      boxThisLap: checked("boxNow"),
    };
  }

  if (Object.keys(errors).length > 0) return { input: null, live: null, errors };

  return {
    errors,
    live,
    input: {
      raceSeconds,
      lapSeconds,
      fuelPerLap,
      tankLitres,
      marginLaps,
      startFuelLitres,
      pitLaneLossSeconds,
      refuelRate,
      tyreChange2Seconds,
      tyreChange4Seconds,
      driverSwapSeconds,
      simultaneousService: checked("together"),
      tyreWearPerLap,
      tyreMinCondition,
      maxTyres,
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
    data.driverNow = String(driverSelect().selectedIndex);
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
    // The two mode buttons are a pair: exactly one of them is on.
    field("modePre").checked = !field("modeLive").checked;
    syncDriverSelect();
    const driverNow = Number(data.driverNow);
    if (Number.isInteger(driverNow) && driverNow >= 0 && driverNow < driverSelect().options.length) {
      driverSelect().selectedIndex = driverNow;
    }
  } catch {
    // Unreadable saved data: keep the defaults.
  }
}

/** Put every field back to the value written in index.html. */
export function resetForm(): void {
  for (const id of TEXT_IDS) field(id).value = field(id).defaultValue;
  for (const id of CHECK_IDS) field(id).checked = field(id).defaultChecked;
  field("modePre").checked = true;
  setDriverBoxes(DEFAULT_DRIVERS);
  syncDriverSelect();
  driverSelect().selectedIndex = 0;
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
