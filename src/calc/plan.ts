import type { DriverTime, PitStop, Plan, PlanError, PlanInput, PlanResult, Stint } from "./types";

// Computers store decimals imprecisely: 90 / 3.6 can come out as 24.999999999999996.
// A tiny tolerance stops that from costing (or adding) a whole lap.
const EPS = 1e-9;

/** Round down, but treat values a hair below a whole number as that whole number. */
export function floorSafe(x: number): number {
  return Math.floor(x + EPS);
}

/** Round up, but treat values a hair above a whole number as that whole number. */
export function ceilSafe(x: number): number {
  return Math.ceil(x - EPS);
}

/** Laps you can drive on this much fuel while keeping the margin in the tank. */
export function fuelStintLaps(fuelLitres: number, fuelPerLap: number, marginLaps: number): number {
  return floorSafe(fuelLitres / fuelPerLap - marginLaps);
}

/** Laps a new set of tyres lasts before dropping below the minimum condition. */
export function tyreStintLaps(wearPerLap: number, minCondition: number): number {
  if (wearPerLap <= 0) return Infinity;
  return floorSafe((100 - minCondition) / wearPerLap);
}

/**
 * Laps still to drive. The race ends on the first lap that finishes
 * at or after the moment the clock hits zero. Always at least one lap.
 */
export function lapsToFinish(remainingSeconds: number, lapSeconds: number): number {
  return Math.max(1, ceilSafe(remainingSeconds / lapSeconds));
}

/** Time standing still in the pit box. */
export function stationarySeconds(
  refuelSeconds: number,
  tyreSeconds: number,
  swapSeconds: number,
  simultaneous: boolean,
): number {
  const service = simultaneous ? Math.max(refuelSeconds, tyreSeconds) : refuelSeconds + tyreSeconds;
  return service + swapSeconds;
}

function fail(error: string): PlanError {
  return { ok: false, error };
}

function isNumber(x: number): boolean {
  return Number.isFinite(x);
}

function validate(c: PlanInput): string | null {
  if (!isNumber(c.raceSeconds) || c.raceSeconds <= 0) return "Enter a race length longer than zero.";
  if (!isNumber(c.lapSeconds) || c.lapSeconds <= 0) return "Enter a lap time, for example 3:32.0.";
  if (!isNumber(c.fuelPerLap) || c.fuelPerLap <= 0) return "Enter the fuel use per lap.";
  if (!isNumber(c.tankLitres) || c.tankLitres <= 0) return "Enter the tank size.";
  if (!isNumber(c.marginLaps) || c.marginLaps < 0) return "The safety margin cannot be negative.";
  if (!isNumber(c.startFuelLitres) || c.startFuelLitres <= 0) return "Enter the fuel at the start.";
  if (c.startFuelLitres > c.tankLitres + EPS) return "The fuel at the start is more than the tank holds.";
  if (!isNumber(c.refuelRate) || c.refuelRate <= 0) return "Enter the refuel rate.";
  if (!isNumber(c.pitLaneLossSeconds) || c.pitLaneLossSeconds < 0) return "The pit lane loss cannot be negative.";
  if (!isNumber(c.tyreChangeSeconds) || c.tyreChangeSeconds < 0) return "The tyre change time cannot be negative.";
  if (!isNumber(c.driverSwapSeconds) || c.driverSwapSeconds < 0) return "The driver swap time cannot be negative.";
  if (!isNumber(c.tyreWearPerLap) || c.tyreWearPerLap < 0) return "The tyre wear per lap cannot be negative.";
  if (!isNumber(c.tyreMinCondition) || c.tyreMinCondition < 0 || c.tyreMinCondition >= 100) {
    return "The minimum tyre condition must be between 0 and 99 percent.";
  }
  return null;
}

// Stops the loop if the inputs describe an absurd race (for example 1-lap stints for 24 hours).
const MAX_STINTS = 2000;

export function planRace(c: PlanInput): PlanResult {
  const problem = validate(c);
  if (problem) return fail(problem);

  const drivers = c.drivers.length > 0 ? c.drivers : ["Driver 1"];
  const swapping = c.rotateDrivers && drivers.length > 1;

  const tankLaps = fuelStintLaps(c.tankLitres, c.fuelPerLap, c.marginLaps);
  if (tankLaps < 1) {
    return fail("The tank cannot cover one lap plus the safety margin. Raise the tank size or lower the margin.");
  }
  const tyreLaps = tyreStintLaps(c.tyreWearPerLap, c.tyreMinCondition);
  if (tyreLaps < 1) {
    return fail("New tyres drop below your minimum within one lap. Lower the wear per lap or the minimum.");
  }
  const firstFuelLaps = fuelStintLaps(c.startFuelLitres, c.fuelPerLap, c.marginLaps);
  if (firstFuelLaps < 1) {
    return fail("The fuel at the start cannot cover one lap plus the safety margin.");
  }

  const fullStintLaps = Math.min(tankLaps, tyreLaps);

  const stints: Stint[] = [];
  let clock = 0;
  let lapNo = 0;
  let fuel = c.startFuelLitres;
  let lapsOnTyres = 0;
  // Laps the car is fuelled and "tyred" for in the coming stint.
  let plannedLaps = Math.min(firstFuelLaps, tyreLaps);

  for (let i = 0; ; i++) {
    if (i >= MAX_STINTS) return fail("This plan needs more than 2000 stints. Check the inputs.");

    const needed = lapsToFinish(c.raceSeconds - clock, c.lapSeconds);
    const final = needed <= plannedLaps;
    const laps = final ? needed : plannedLaps;
    const driverIndex = swapping ? i % drivers.length : 0;

    const tyreAtStart = 100 - c.tyreWearPerLap * lapsOnTyres;
    const end = clock + laps * c.lapSeconds;
    const fuelAtEnd = fuel - laps * c.fuelPerLap;
    lapsOnTyres += laps;

    const stint: Stint = {
      n: i + 1,
      driver: drivers[driverIndex] ?? "Driver 1",
      driverIndex,
      startSeconds: clock,
      endSeconds: end,
      firstLap: lapNo + 1,
      lastLap: lapNo + laps,
      laps,
      fuelAtStart: fuel,
      fuelAtEnd,
      tyreAtStart,
      tyreAtEnd: 100 - c.tyreWearPerLap * lapsOnTyres,
      final,
      stop: null,
    };
    lapNo += laps;
    stints.push(stint);
    if (final) break;

    // Work out the stop for a next stint of n laps.
    const stopFor = (n: number): PitStop => {
      const target = Math.min(c.tankLitres, (n + c.marginLaps) * c.fuelPerLap);
      let fuelAdded = target - fuelAtEnd;
      if (fuelAdded < EPS) fuelAdded = 0;
      // Change tyres when the current set would drop below the minimum during the next stint.
      const tyresChanged = 100 - c.tyreWearPerLap * (lapsOnTyres + n) < c.tyreMinCondition - EPS;
      const stationary = stationarySeconds(
        fuelAdded / c.refuelRate,
        tyresChanged ? c.tyreChangeSeconds : 0,
        swapping ? c.driverSwapSeconds : 0,
        c.simultaneousService,
      );
      return { fuelAdded, tyresChanged, stationarySeconds: stationary, pitSeconds: c.pitLaneLossSeconds + stationary };
    };

    // A shorter stop leaves more race time, which can mean one more lap to drive.
    // So look for the smallest next stint that still reaches the finish with its own stop time.
    // If there is none, the next stint is a normal full stint.
    let nextLaps = fullStintLaps;
    let stop = stopFor(fullStintLaps);
    for (let n = 1; n < fullStintLaps; n++) {
      const candidate = stopFor(n);
      const lapsAfterStop = lapsToFinish(c.raceSeconds - end - candidate.pitSeconds, c.lapSeconds);
      if (lapsAfterStop <= n) {
        nextLaps = n;
        stop = candidate;
        break;
      }
    }

    stint.stop = stop;
    clock = end + stop.pitSeconds;
    fuel = fuelAtEnd + stop.fuelAdded;
    if (stop.tyresChanged) lapsOnTyres = 0;
    plannedLaps = nextLaps;
  }

  const perDriverMap = new Map<number, DriverTime>();
  let pitSecondsTotal = 0;
  let tyreChanges = 0;
  for (const s of stints) {
    if (s.stop) {
      pitSecondsTotal += s.stop.pitSeconds;
      if (s.stop.tyresChanged) tyreChanges++;
    }
    const entry = perDriverMap.get(s.driverIndex) ?? { driver: s.driver, driverIndex: s.driverIndex, seconds: 0 };
    entry.seconds += s.endSeconds - s.startSeconds;
    perDriverMap.set(s.driverIndex, entry);
  }

  const last = stints[stints.length - 1];
  const plan: Plan = {
    ok: true,
    stints,
    fullStintLaps,
    stintLimitedBy: tyreLaps < tankLaps ? "tyres" : "fuel",
    totalLaps: lapNo,
    stops: stints.length - 1,
    tyreChanges,
    pitSecondsTotal,
    finishSeconds: last ? last.endSeconds : 0,
    drivers,
    swapping,
    perDriver: [...perDriverMap.values()],
  };
  return plan;
}
