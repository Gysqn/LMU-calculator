import { describe, expect, it } from "vitest";
import { fuelStintLaps, lapsToFinish, planRace, spreadChanges, stationarySeconds, tyreStintLaps } from "./plan";
import type { Plan, PlanInput } from "./types";

// The example race from SPEC.md. Tyre wear is off (0) unless a test turns it on.
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
    tyreChange2Seconds: 8,
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

function ok(c: PlanInput): Plan {
  const r = planRace(c);
  if (!r.ok) throw new Error("Expected a plan, got error: " + r.error);
  return r;
}

describe("small helpers", () => {
  it("gives 24 laps for a 90 L tank at 3.6 L per lap with 1 lap margin", () => {
    expect(fuelStintLaps(90, 3.6, 1)).toBe(24);
  });

  it("does not lose a lap to floating-point rounding", () => {
    // 0.1 * 3 is 0.30000000000000004 in JavaScript, so 0.3 / (0.1 * 3) is just under 1.
    expect(fuelStintLaps(0.3, 0.1 * 3, 0)).toBe(1);
    expect(fuelStintLaps(100, 2.5, 0)).toBe(40);
    expect(fuelStintLaps(75, 2.7, 0.5)).toBe(27);
  });

  it("counts the laps until the first lap that ends after the clock hits zero", () => {
    expect(lapsToFinish(1000, 212)).toBe(5); // 4 laps = 848 s, 5 laps = 1060 s
    expect(lapsToFinish(424, 212)).toBe(2); // exactly 2 laps
    expect(lapsToFinish(0, 212)).toBe(1);
    expect(lapsToFinish(-30, 212)).toBe(1);
  });

  it("knows how long new tyres last", () => {
    expect(tyreStintLaps(1, 50)).toBe(50);
    expect(tyreStintLaps(2.5, 40)).toBe(24);
    expect(tyreStintLaps(0, 50)).toBe(Infinity);
  });

  it("adds up stationary time", () => {
    expect(stationarySeconds(30, 12, 0, true)).toBe(30);
    expect(stationarySeconds(5, 12, 0, true)).toBe(12);
    expect(stationarySeconds(30, 12, 0, false)).toBe(42);
    expect(stationarySeconds(30, 12, 8, true)).toBe(38);
  });
});

describe("planRace: SPEC test cases", () => {
  it("uses 24-lap stints in the 6 hour example", () => {
    const r = ok(input());
    expect(r.fullStintLaps).toBe(24);
    expect(r.stints[0]?.laps).toBe(24);
  });

  it("returns a clear error when the tank cannot cover 1 lap plus margin", () => {
    const r = planRace(input({ tankLitres: 5, startFuelLitres: 5, fuelPerLap: 3.6, marginLaps: 1 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/tank cannot cover one lap/i);
  });

  it("ends on the first lap that finishes after the clock hits zero", () => {
    const c = input();
    const r = ok(c);
    // The finish is at or after zero, and one lap earlier the clock was still running.
    expect(r.finishSeconds).toBeGreaterThanOrEqual(c.raceSeconds);
    expect(r.finishSeconds - c.lapSeconds).toBeLessThan(c.raceSeconds);
    const last = r.stints[r.stints.length - 1];
    expect(last?.final).toBe(true);
    expect(last?.stop).toBeNull();
  });

  it("does not add swap time with one driver", () => {
    const r = ok(input({ drivers: ["Alex"] }));
    const stop = r.stints[0]?.stop;
    // Start 90 L, 24 laps use 86.4 L, 3.6 L left. Refill to 90 L = 86.4 L at 2.5 L/s = 34.56 s.
    expect(stop?.fuelAdded).toBeCloseTo(86.4, 6);
    expect(stop?.stationarySeconds).toBeCloseTo(34.56, 6);
    expect(stop?.pitSeconds).toBeCloseTo(28 + 34.56, 6);
    expect(r.swapping).toBe(false);
    expect(r.perDriver).toHaveLength(1);
  });

  it("adds swap time when the driver changes", () => {
    const r = ok(input());
    expect(r.stints[0]?.stop?.pitSeconds).toBeCloseTo(28 + 34.56 + 8, 6);
    expect(r.stints.map((s) => s.driver).slice(0, 4)).toEqual(["Alex", "Sam", "Kim", "Alex"]);
  });

  it("does not swap when rotation is off", () => {
    const r = ok(input({ rotateDrivers: false }));
    expect(new Set(r.stints.map((s) => s.driver))).toEqual(new Set(["Alex"]));
    expect(r.stints[0]?.stop?.pitSeconds).toBeCloseTo(28 + 34.56, 6);
  });
});

describe("planRace: consistency", () => {
  const cases: [string, Partial<PlanInput>][] = [
    ["6 h example", {}],
    ["24 h", { raceSeconds: 24 * 3600 }],
    ["short race, no stop", { raceSeconds: 30 * 60 }],
    ["half tank at the start", { startFuelLitres: 45 }],
    ["tyre wear with double stints", { tyreWearPerLap: 1, tyreMinCondition: 50 }],
    ["tyre-limited stints", { tyreWearPerLap: 5, tyreMinCondition: 50 }],
    ["service one after the other", { simultaneousService: false, tyreWearPerLap: 2 }],
    ["odd numbers", { lapSeconds: 97.3, fuelPerLap: 2.37, tankLitres: 75, startFuelLitres: 75, marginLaps: 0.5, raceSeconds: 8 * 3600 + 17 * 60 }],
    ["no margin", { marginLaps: 0 }],
  ];

  for (const [name, overrides] of cases) {
    it("holds for: " + name, () => {
      const c = input(overrides);
      const r = ok(c);
      const marginFuel = c.marginLaps * c.fuelPerLap;

      // The race ends on the right lap.
      expect(r.finishSeconds).toBeGreaterThanOrEqual(c.raceSeconds - 1e-6);
      expect(r.finishSeconds - c.lapSeconds).toBeLessThan(c.raceSeconds);

      let clock = 0;
      let lap = 0;
      let fuel = c.startFuelLitres;
      for (const s of r.stints) {
        // Stints follow each other without gaps in time or laps.
        expect(s.startSeconds).toBeCloseTo(clock, 6);
        expect(s.firstLap).toBe(lap + 1);
        expect(s.lastLap - s.firstLap + 1).toBe(s.laps);
        expect(s.endSeconds - s.startSeconds).toBeCloseTo(s.laps * c.lapSeconds, 6);
        // Fuel: never over the tank, never under the margin.
        expect(s.fuelAtStart).toBeCloseTo(fuel, 6);
        expect(s.fuelAtStart).toBeLessThanOrEqual(c.tankLitres + 1e-6);
        expect(s.fuelAtEnd).toBeGreaterThanOrEqual(marginFuel - 1e-6);
        // Tyres: never under the minimum.
        if (c.tyreWearPerLap > 0) expect(s.tyresAtEnd[0]).toBeGreaterThanOrEqual(c.tyreMinCondition - 1e-6);

        lap = s.lastLap;
        clock = s.endSeconds + (s.stop?.pitSeconds ?? 0);
        fuel = s.fuelAtEnd + (s.stop?.fuelAdded ?? 0);
        expect(s.final).toBe(s.stop === null);
      }
      expect(r.totalLaps).toBe(lap);
      expect(r.stops).toBe(r.stints.length - 1);

      // Driving time plus pit time is the whole race.
      const driving = r.perDriver.reduce((sum, d) => sum + d.seconds, 0);
      expect(driving + r.pitSecondsTotal).toBeCloseTo(r.finishSeconds, 6);
    });
  }
});

describe("planRace: last stint", () => {
  it("only takes the fuel it needs", () => {
    const c = input();
    const r = ok(c);
    const last = r.stints[r.stints.length - 1];
    const beforeLast = r.stints[r.stints.length - 2];
    expect(last && beforeLast).toBeTruthy();
    if (!last || !beforeLast) return;
    // Fuel for the laps of the last stint plus the margin, not a full tank.
    expect(last.fuelAtStart).toBeCloseTo((last.laps + c.marginLaps) * c.fuelPerLap, 6);
    expect(last.fuelAtStart).toBeLessThan(c.tankLitres);
    expect(last.fuelAtEnd).toBeCloseTo(c.marginLaps * c.fuelPerLap, 6);
  });

  it("finishes without a stop when the start fuel covers the race", () => {
    const r = ok(input({ raceSeconds: 30 * 60 }));
    expect(r.stops).toBe(0);
    expect(r.stints).toHaveLength(1);
    expect(r.totalLaps).toBe(9); // 1800 / 212 = 8.49, so the 9th lap ends after zero
  });
});

describe("planRace: start fuel", () => {
  it("makes the first stint shorter with less fuel at the start", () => {
    const r = ok(input({ startFuelLitres: 45 }));
    // 45 / 3.6 = 12.5 laps, minus 1 lap margin, rounded down = 11.
    expect(r.stints[0]?.laps).toBe(11);
    expect(r.stints[1]?.laps).toBe(24);
  });

  it("rejects more start fuel than the tank holds", () => {
    const r = planRace(input({ startFuelLitres: 100 }));
    expect(r.ok).toBe(false);
  });

  it("rejects start fuel that cannot cover one lap plus margin", () => {
    const r = planRace(input({ startFuelLitres: 5 }));
    expect(r.ok).toBe(false);
  });
});

describe("spreadChanges", () => {
  it("puts one change in the middle", () => {
    expect(spreadChanges([10, 10, 10, 10], 1)).toEqual([false, true, false]);
  });

  it("keeps the longest run on one set as short as possible", () => {
    // Two changes over 24+24+24+24+5 laps: the best split is 48 / 48 / 5.
    expect(spreadChanges([24, 24, 24, 24, 5], 2)).toEqual([false, true, false, true]);
    // One change: 48 / 53 beats 72 / 29.
    expect(spreadChanges([24, 24, 24, 24, 5], 1)).toEqual([false, true, false, false]);
  });

  it("changes at every stop when there are enough changes", () => {
    expect(spreadChanges([10, 10, 10], 5)).toEqual([true, true]);
  });

  it("changes nowhere without changes", () => {
    expect(spreadChanges([10, 10, 10], 0)).toEqual([false, false]);
  });
});

describe("planRace: tyres", () => {
  it("never changes tyres when wear is 0", () => {
    const r = ok(input());
    expect(r.tyresUsed).toBe(4);
  });

  it("double-stints tyres when they last two stints", () => {
    // 1% per lap, minimum 50%: tyres last 50 laps, so two 24-lap stints (48 laps) but not three.
    const r = ok(input({ tyreWearPerLap: 1, tyreMinCondition: 50 }));
    expect(r.stints.map((s) => s.stop?.tyresChanged ?? null).slice(0, 3)).toEqual([0, 4, 0]);
    expect(r.stints[0]?.tyresAtEnd[0]).toBeCloseTo(76, 6);
    expect(r.stints[1]?.tyresAtEnd[0]).toBeCloseTo(52, 6);
    expect(r.stints[2]?.tyresAtEnd[0]).toBeCloseTo(76, 6); // new tyres were fitted before stint 3
  });

  it("changes all four tyres at every stop when they last only one stint", () => {
    // 2% per lap, minimum 50%: 25 laps per set, one 24-lap stint.
    const r = ok(input({ tyreWearPerLap: 2, tyreMinCondition: 50 }));
    for (const s of r.stints) {
      if (s.stop) expect(s.stop.tyresChanged).toBe(4);
    }
    expect(r.tyreStrategy).toBe("asNeeded");
  });

  it("shortens the stint when tyres wear out before the fuel does", () => {
    // 5% per lap, minimum 50%: 10 laps per set, less than the 24 laps of fuel.
    const c = input({ tyreWearPerLap: 5, tyreMinCondition: 50 });
    const r = ok(c);
    expect(r.fullStintLaps).toBe(10);
    expect(r.stintLimitedBy).toBe("tyres");
    expect(r.stints[0]?.laps).toBe(10);
    // After 10 laps the full tank still holds 54 L, more than the next 10 laps need. So no fuel is added.
    expect(r.stints[0]?.stop?.fuelAdded).toBe(0);
    expect(r.stints[0]?.stop?.tyresChanged).toBe(4);
    expect(r.stints[1]?.fuelAtStart).toBeCloseTo(54, 6);
    // Two stints later the tank is low, and the stop adds only what 10 laps plus margin need.
    expect(r.stints[2]?.fuelAtStart).toBeCloseTo(11 * 3.6, 6);
  });

  it("returns an error when new tyres cannot do one lap and there is no tyre limit", () => {
    const r = planRace(input({ tyreWearPerLap: 60, tyreMinCondition: 50 }));
    expect(r.ok).toBe(false);
  });

  it("takes longer when refuelling and tyres happen one after the other", () => {
    const together = ok(input({ tyreWearPerLap: 2, simultaneousService: true }));
    const sequential = ok(input({ tyreWearPerLap: 2, simultaneousService: false }));
    const a = together.stints[0]?.stop;
    const b = sequential.stints[0]?.stop;
    expect(a?.stationarySeconds).toBeCloseTo(34.56 + 8, 6); // refuel is longer than the tyre change
    expect(b?.stationarySeconds).toBeCloseTo(34.56 + 12 + 8, 6); // 12 s for four tyres
  });
});

describe("planRace: limited number of tyres", () => {
  // 2% per lap, minimum 50%: without a limit this race changes all four tyres at all 4 stops.
  // That is 4 starting tyres + 16 = 20 tyres.
  const wearing = { tyreWearPerLap: 2, tyreMinCondition: 50 };

  it("uses 20 tyres without a limit", () => {
    const r = ok(input(wearing));
    expect(r.tyresUsed).toBe(20);
    expect(r.tyreStrategy).toBe("asNeeded");
    expect(r.lowestTyre).toBeCloseTo(52, 6);
  });

  it("changes nothing when there are enough tyres", () => {
    const free = ok(input(wearing));
    const limited = ok(input({ ...wearing, maxTyres: 20 }));
    expect(limited).toEqual(free);
  });

  it("spreads the changes over the race when there are too few tyres", () => {
    // 12 tyres: 8 to change, so each pair is changed twice. Best split of the race: after stints 2 and 4.
    const r = ok(input({ ...wearing, maxTyres: 12 }));
    expect(r.tyreStrategy).toBe("spread");
    expect(r.stints.map((s) => s.stop?.tyresChanged ?? null)).toEqual([0, 4, 0, 4, null]);
    expect(r.tyresUsed).toBe(12);
    // The worst moment is after two stints (48 laps) on one set: 100 - 96 = 4%.
    expect(r.lowestTyre).toBeCloseTo(4, 6);
    expect(r.lowestTyreStint).toBe(2);
    expect(r.stints[1]?.tyreBelowMin).toBe(true);
  });

  it("changes two tyres when only one pair is left", () => {
    // 10 tyres: 6 to change, so one pair is changed twice and the other once.
    const r = ok(input({ ...wearing, maxTyres: 10, simultaneousService: false }));
    expect(r.stints.map((s) => s.stop?.tyresChanged ?? null)).toEqual([0, 4, 0, 2, null]);
    expect(r.tyresUsed).toBe(10);
    // The two-tyre stop uses the two-tyre time (8 s), next to refuelling and the 8 s driver swap.
    const stop = r.stints[3]?.stop;
    expect(stop).toBeTruthy();
    if (stop) expect(stop.stationarySeconds - stop.fuelAdded / 2.5 - 8).toBeCloseTo(8, 6);
    // After that stop the two pairs have a different age.
    const last = r.stints[4];
    expect(last && last.tyresAtEnd[0] < last.tyresAtEnd[1]).toBe(true);
  });

  it("never uses more tyres than allowed", () => {
    for (const maxTyres of [4, 5, 6, 7, 8, 9, 11, 13, 14, 16, 18, 19]) {
      const r = ok(input({ ...wearing, raceSeconds: 24 * 3600, maxTyres }));
      expect(r.tyresUsed).toBeLessThanOrEqual(maxTyres);
      // Tyres go on in pairs, so at most one tyre is left over.
      expect(r.tyresUsed).toBeGreaterThanOrEqual(maxTyres - 1);
    }
  });

  it("never changes tyres with only the starting four", () => {
    const r = ok(input({ ...wearing, maxTyres: 4, simultaneousService: false }));
    expect(r.tyresUsed).toBe(4);
    // Refuel 34.56 s plus the swap, without any tyre change time.
    expect(r.stints[0]?.stop?.stationarySeconds).toBeCloseTo(34.56 + 8, 6);
  });

  it("drives fuel-length stints when there are too few tyres for tyre-length stints", () => {
    // 5% per lap: tyres last 10 laps above the minimum. With 8 tyres that cannot be kept up.
    const r = ok(input({ tyreWearPerLap: 5, tyreMinCondition: 50, maxTyres: 8 }));
    expect(r.tyreStrategy).toBe("spread");
    expect(r.stints[0]?.laps).toBe(24);
    expect(r.tyresUsed).toBeLessThanOrEqual(8);
  });

  it("rejects a number of tyres that is not a whole number of at least 4", () => {
    expect(planRace(input({ maxTyres: 3 })).ok).toBe(false);
    expect(planRace(input({ maxTyres: 8.5 })).ok).toBe(false);
  });
});

describe("planRace: input checks", () => {
  it("rejects nonsense", () => {
    expect(planRace(input({ raceSeconds: 0 })).ok).toBe(false);
    expect(planRace(input({ lapSeconds: NaN })).ok).toBe(false);
    expect(planRace(input({ fuelPerLap: 0 })).ok).toBe(false);
    expect(planRace(input({ refuelRate: 0 })).ok).toBe(false);
    expect(planRace(input({ marginLaps: -1 })).ok).toBe(false);
    expect(planRace(input({ tyreMinCondition: 100 })).ok).toBe(false);
  });

  it("uses a default driver name when none is given", () => {
    const r = ok(input({ drivers: [] }));
    expect(r.stints[0]?.driver).toBe("Driver 1");
  });
});
