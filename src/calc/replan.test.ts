import { describe, expect, it } from "vitest";
import { planRace, replanRace } from "./plan";
import type { LiveState, Plan, PlanInput, PlanResult } from "./types";

// 6 h race, 24-lap stints, tyres lose 1% per lap and last two stints above the 50% minimum.
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
    tyreWearPerLap: 1,
    tyreMinCondition: 50,
    maxTyres: null,
    drivers: ["Alex", "Sam", "Kim"],
    rotateDrivers: true,
    ...overrides,
  };
}

function live(overrides: Partial<LiveState> = {}): LiveState {
  return {
    timeLeftSeconds: 3 * 3600,
    lapsDone: 50,
    fuelLitres: 60,
    tyreCondition: 80,
    tyresUsed: 4,
    driverIndex: 0,
    boxThisLap: false,
    ...overrides,
  };
}

function ok(r: PlanResult): Plan {
  if (!r.ok) throw new Error("Expected a plan, got error: " + r.error);
  return r;
}

describe("replanRace", () => {
  it("gives the pre-race plan when nothing has happened yet", () => {
    const c = input();
    const fresh = live({ timeLeftSeconds: c.raceSeconds, lapsDone: 0, fuelLitres: 90, tyreCondition: 100 });
    expect(replanRace(c, fresh)).toEqual(planRace(c));
  });

  it("ends up with the same race when everything went to plan", () => {
    const c = input();
    const base = ok(planRace(c));
    // Six laps into stint 2 (laps 25-48, driven by Sam, on the tyres from the start).
    const stint2 = base.stints[1];
    expect(stint2).toBeTruthy();
    if (!stint2) return;
    const r = ok(
      replanRace(c, {
        timeLeftSeconds: c.raceSeconds - (stint2.startSeconds + 6 * c.lapSeconds),
        lapsDone: 30,
        fuelLitres: stint2.fuelAtStart - 6 * c.fuelPerLap,
        tyreCondition: 70, // 30 laps at 1% per lap
        tyresUsed: 4,
        driverIndex: 1,
        boxThisLap: false,
      }),
    );
    const first = r.stints[0];
    expect(first?.driver).toBe("Sam");
    expect(first?.firstLap).toBe(31);
    expect(first?.lastLap).toBe(48);
    expect(first?.stop?.tyresChanged).toBe(stint2.stop?.tyresChanged);
    expect(first?.stop?.fuelAdded).toBeCloseTo(stint2.stop?.fuelAdded ?? NaN, 6);
    expect(first?.stop?.pitSeconds).toBeCloseTo(stint2.stop?.pitSeconds ?? NaN, 6);
    expect(r.totalLaps).toBe(base.totalLaps);
    expect(r.finishSeconds).toBeCloseTo(base.finishSeconds, 6);
    expect(r.tyresUsed).toBe(base.tyresUsed);
    // The rest of the race is the same as in the pre-race plan, only numbered from 1 again.
    expect(r.stints.slice(1).map((s) => [s.driver, s.firstLap, s.lastLap])).toEqual(
      base.stints.slice(2).map((s) => [s.driver, s.firstLap, s.lastLap]),
    );
  });

  it("continues lap numbers, the clock and the driver order from now", () => {
    const r = ok(replanRace(input(), live({ driverIndex: 2 })));
    expect(r.stints[0]?.firstLap).toBe(51);
    expect(r.stints[0]?.startSeconds).toBe(3 * 3600);
    expect(r.stints.map((s) => s.driver).slice(0, 3)).toEqual(["Kim", "Alex", "Sam"]);
  });

  it("plans the current stint on the fuel that is in the tank", () => {
    // 60 L / 3.6 = 16.67 laps, minus 1 lap margin = 15 laps.
    const r = ok(replanRace(input(), live({ fuelLitres: 60 })));
    expect(r.stints[0]?.laps).toBe(15);
    expect(r.stints[0]?.fuelAtStart).toBe(60);
  });

  it("comes in earlier when the tyres are nearly at the minimum", () => {
    // 55% now, minimum 50%, 1% per lap: five more laps.
    const r = ok(replanRace(input(), live({ tyreCondition: 55 })));
    expect(r.stints[0]?.laps).toBe(5);
    expect(r.stints[0]?.stop?.tyresChanged).toBe(4);
  });

  it("boxes at the end of this lap when asked", () => {
    const r = ok(replanRace(input(), live({ boxThisLap: true })));
    expect(r.stints[0]?.laps).toBe(1);
    expect(r.stints[0]?.lastLap).toBe(51);
    // Full tank again: 60 - 3.6 = 56.4 L left, add 33.6 L.
    expect(r.stints[0]?.stop?.fuelAdded).toBeCloseTo(33.6, 6);
    expect(r.stints[1]?.laps).toBe(24);
  });

  it("drives one lap to the pits when only the margin is left", () => {
    // 5 L covers one lap (3.6 L) but not one lap plus the margin.
    const r = ok(replanRace(input(), live({ fuelLitres: 5 })));
    expect(r.stints[0]?.laps).toBe(1);
  });

  it("returns an error when the fuel cannot cover one lap", () => {
    const r = replanRace(input(), live({ fuelLitres: 2 }));
    expect(r.ok).toBe(false);
  });

  it("finishes without a stop when the fuel reaches the end", () => {
    const r = ok(replanRace(input(), live({ timeLeftSeconds: 20 * 60, fuelLitres: 40, lapsDone: 95 })));
    expect(r.stops).toBe(0);
    expect(r.totalLaps).toBe(95 + 6); // 1200 / 212 = 5.66, so the 6th lap ends after zero
  });

  it("only uses the tyres that are left", () => {
    const wearing = input({ tyreWearPerLap: 2, maxTyres: 12 });
    const noneLeft = ok(replanRace(wearing, live({ tyresUsed: 12 })));
    expect(noneLeft.tyresUsed).toBe(12);
    expect(noneLeft.stints.every((s) => !s.stop || s.stop.tyresChanged === 0)).toBe(true);

    const fourLeft = ok(replanRace(wearing, live({ tyresUsed: 8 })));
    expect(fourLeft.tyresUsed).toBe(12);
  });

  it("checks the live numbers", () => {
    const c = input();
    expect(replanRace(c, live({ timeLeftSeconds: 7 * 3600 })).ok).toBe(false);
    expect(replanRace(c, live({ lapsDone: 2.5 })).ok).toBe(false);
    expect(replanRace(c, live({ fuelLitres: 120 })).ok).toBe(false);
    expect(replanRace(c, live({ tyreCondition: 140 })).ok).toBe(false);
    expect(replanRace(c, live({ tyresUsed: 2 })).ok).toBe(false);
    expect(replanRace(input({ maxTyres: 8 }), live({ tyresUsed: 12 })).ok).toBe(false);
  });
});
