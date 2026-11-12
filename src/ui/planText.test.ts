import { describe, expect, it } from "vitest";
import { planRace } from "../calc/plan";
import type { PlanInput } from "../calc/types";
import { planText } from "./planText";

const input: PlanInput = {
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
  tyreWearPerLap: 1,
  tyreMinCondition: 50,
  maxTyres: null,
  drivers: ["Alex", "Sam"],
  rotateDrivers: true,
};

describe("planText", () => {
  it("writes one line per stint", () => {
    const r = planRace(input);
    if (!r.ok) throw new Error(r.error);
    const lines = planText(input, r).split("\n");
    expect(lines[0]).toBe("Stint plan: 6:00:00 race, 3:32.0 laps, " + r.totalLaps + " laps, " + r.stops + " stops");
    expect(lines[1]).toBe("");
    expect(lines).toHaveLength(r.stints.length + 2);
    expect(lines[2]).toBe("Stint 1 | Alex | laps 1-24 | 0:00:00 to 1:24:48 | box, add 86.4 L, keep tyres, 71 s in the pits");
    expect(lines[3]).toContain("4 new tyres");
    expect(lines[lines.length - 1]).toMatch(/\| finish$/);
  });
});
