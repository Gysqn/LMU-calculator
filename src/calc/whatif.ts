import { planRace, replanRace } from "./plan";
import type { LiveState, PlanInput, PlanResult } from "./types";

/** What it takes to finish the race with one pit stop less. */
export interface StopSaving {
  /** Pit stops in the normal plan, and in the plan that saves fuel. */
  stopsNow: number;
  stopsThen: number;
  /** The highest fuel use per lap that still saves the stop. */
  fuelPerLap: number;
  /** How much less that is than the current fuel use, in litres and as a share (0.05 = 5%). */
  savingPerLap: number;
  savingShare: number;
  /** Time in the pits saved over the race. Slower laps from saving fuel are not counted. */
  pitSecondsSaved: number;
}

// Saving more than half your fuel is not driving any more, so the search stops there.
const LARGEST_SAVING = 0.5;

function plan(c: PlanInput, live: LiveState | null): PlanResult {
  return live ? replanRace(c, live) : planRace(c);
}

/**
 * How little fuel per lap you would have to use to need one pit stop less.
 * Returns null when there is no stop to save, or when saving fuel does not save a stop
 * (for example when the tyres, not the fuel, decide when you stop).
 */
export function fuelToSaveAStop(c: PlanInput, live: LiveState | null = null): StopSaving | null {
  const base = plan(c, live);
  if (!base.ok || base.stops === 0) return null;
  const target = base.stops - 1;

  const savesAStop = (fuelPerLap: number): boolean => {
    const r = plan({ ...c, fuelPerLap }, live);
    return r.ok && r.stops <= target;
  };

  // Fuel use is entered in hundredths of a litre, so search in whole hundredths.
  const highest = Math.round(c.fuelPerLap * 100) - 1;
  const lowest = Math.ceil(c.fuelPerLap * (1 - LARGEST_SAVING) * 100);
  if (highest < lowest || !savesAStop(lowest / 100)) return null;

  // Find the highest fuel use that still saves the stop.
  let low = lowest; // known to save the stop
  let high = highest;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (savesAStop(middle / 100)) low = middle;
    else high = middle - 1;
  }

  const fuelPerLap = low / 100;
  const saved = plan({ ...c, fuelPerLap }, live);
  if (!saved.ok) return null;
  return {
    stopsNow: base.stops,
    stopsThen: saved.stops,
    fuelPerLap,
    savingPerLap: c.fuelPerLap - fuelPerLap,
    savingShare: (c.fuelPerLap - fuelPerLap) / c.fuelPerLap,
    pitSecondsSaved: base.pitSecondsTotal - saved.pitSecondsTotal,
  };
}
