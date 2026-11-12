import { parseLapTime } from "../calc/time";
import type { PlanInput } from "../calc/types";

// Reads the form, and saves and restores it in the browser (localStorage).

const TEXT_IDS = ["hours", "mins", "lap", "fuel", "tank", "startFuel", "margin", "wear", "tyreMin", "lane", "rate", "tyre", "swap", "drivers"] as const;
const CHECK_IDS = ["together", "rotate"] as const;
const STORAGE_KEY = "stint-planner-v2";

function field(id: string): HTMLInputElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLInputElement)) throw new Error("Missing input: " + id);
  return el;
}

/** Number from a field. Empty or invalid text gives NaN. */
function num(id: string): number {
  return parseFloat(field(id).value.replace(",", "."));
}

/** Number from a field, with a fallback for an empty field. */
function numOr(id: string, fallback: number): number {
  const n = num(id);
  return Number.isNaN(n) ? fallback : n;
}

export type FormResult = { ok: true; input: PlanInput } | { ok: false; error: string };

export function readForm(): FormResult {
  const lapSeconds = parseLapTime(field("lap").value);
  // Under 20 seconds is almost certainly a half-typed lap time, not a real one.
  if (lapSeconds === null || lapSeconds < 20) {
    return { ok: false, error: "Enter a lap time like 3:32.0 (minutes:seconds)." };
  }
  const tankLitres = num("tank");
  const input: PlanInput = {
    raceSeconds: numOr("hours", 0) * 3600 + numOr("mins", 0) * 60,
    lapSeconds,
    fuelPerLap: num("fuel"),
    tankLitres,
    marginLaps: numOr("margin", 0),
    // An empty start fuel field means a full tank.
    startFuelLitres: numOr("startFuel", tankLitres),
    pitLaneLossSeconds: numOr("lane", 0),
    refuelRate: num("rate"),
    tyreChangeSeconds: numOr("tyre", 0),
    driverSwapSeconds: numOr("swap", 0),
    simultaneousService: field("together").checked,
    tyreWearPerLap: numOr("wear", 0),
    tyreMinCondition: numOr("tyreMin", 0),
    drivers: field("drivers").value.split(",").map((d) => d.trim()).filter(Boolean),
    rotateDrivers: field("rotate").checked,
  };
  return { ok: true, input };
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
