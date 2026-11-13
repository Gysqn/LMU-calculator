import { describe, expect, it } from "vitest";
import { planRace, replanRace } from "./plan";
import type { LiveState, PlanInput } from "./types";
import { fuelToSaveAStop } from "./whatif";

// 6 h race with 24-lap stints: 4 pit stops. Tyre changes are off unless a test turns them on.
function input(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    raceSeconds: 6 * 3600,
    lapSeconds: 212,
    fuelPerLap: 3.6,
    tankLitres: 90,
    marginLaps: 1,
    startFuelLitres: 90,
    pitLaneLossSeconds: 28,
    refuelRate: 2.5,
    tyreChange2Seconds: 6,
    tyreChange4Seconds: 12,
    driverSwapSeconds: 8,
    simultaneousService: true,
    tyreWearPerLap: 0,
    tyreMinCondition: 50,
    maxTyres: null,
    drivers: ["Alex", "Sam", "Kim"],
    rotateDrivers: true,
    ...overrides,
  };
}

function stops(c: PlanInput): number {
  const r = planRace(c);
  if (!r.ok) throw new Error(r.error);
  return r.stops;
}

describe("fuelToSaveAStop", () => {
  it("finds the fuel use that saves one stop", () => {
    const c = input();
    const saving = fuelToSaveAStop(c);
    expect(saving).not.toBeNull();
    if (!saving) return;
    expect(saving.stopsNow).toBe(4);
    expect(saving.stopsThen).toBe(3);
    expect(saving.fuelPerLap).toBeLessThan(3.6);
    expect(saving.savingPerLap).toBeCloseTo(3.6 - saving.fuelPerLap, 9);
    expect(saving.savingShare).toBeCloseTo(saving.savingPerLap / 3.6, 9);
    expect(saving.pitSecondsSaved).toBeGreaterThan(0);
    // The plan with that fuel use really has one stop less ...
    expect(stops({ ...c, fuelPerLap: saving.fuelPerLap })).toBe(3);
    // ... and using one hundredth of a litre more does not.
    expect(stops({ ...c, fuelPerLap: saving.fuelPerLap + 0.01 })).toBe(4);
  });

  it("returns null when the race has no stop", () => {
    expect(fuelToSaveAStop(input({ raceSeconds: 30 * 60 }))).toBeNull();
  });

  it("returns null when the tyres decide the stops, not the fuel", () => {
    // 5% per lap and a 50% minimum: 10-lap stints, far shorter than the fuel allows.
    expect(fuelToSaveAStop(input({ tyreWearPerLap: 5 }))).toBeNull();
  });

  it("returns null when the inputs cannot be planned", () => {
    expect(fuelToSaveAStop(input({ tankLitres: 3 }))).toBeNull();
  });

  it("works from the middle of a race", () => {
    const c = input();
    const live: LiveState = {
      timeLeftSeconds: 3 * 3600,
      lapsDone: 51,
      fuelLitres: 45,
      tyreCondition: 100,
      tyresUsed: 4,
      driverIndex: 0,
      boxThisLap: false,
    };
    const base = replanRace(c, live);
    const saving = fuelToSaveAStop(c, live);
    expect(base.ok && saving).toBeTruthy();
    if (!base.ok || !saving) return;
    expect(saving.stopsNow).toBe(base.stops);
    const saved = replanRace({ ...c, fuelPerLap: saving.fuelPerLap }, live);
    expect(saved.ok && saved.stops).toBe(base.stops - 1);
  });
});
