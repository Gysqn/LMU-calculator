import type { DriverTime, PitStop, PlanError, PlanInput, PlanResult, Stint, TyresChanged } from "./types";

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

/** Laps new tyres last before dropping below the minimum condition. */
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

/**
 * Decide at which stops to fit new tyres when you only have a few changes.
 * `stintLaps` is the laps of every stint; there is one stop between each two stints.
 * Returns one true/false per stop. The changes are placed so the longest run
 * on one set of tyres is as short as possible.
 */
export function spreadChanges(stintLaps: number[], changes: number): boolean[] {
  const stops = Math.max(0, stintLaps.length - 1);
  if (changes >= stops) return new Array<boolean>(stops).fill(true);
  if (changes <= 0) return new Array<boolean>(stops).fill(false);

  // For a given limit on laps per set: change as late as possible and count the changes needed.
  const place = (limit: number): boolean[] => {
    const result: boolean[] = [];
    let run = stintLaps[0] ?? 0;
    for (let i = 1; i < stintLaps.length; i++) {
      const laps = stintLaps[i] ?? 0;
      const change = run + laps > limit;
      result.push(change);
      run = change ? laps : run + laps;
    }
    return result;
  };
  const count = (plan: boolean[]): number => plan.filter(Boolean).length;

  // Find the smallest limit that needs no more changes than we have.
  let low = Math.max(...stintLaps);
  let high = stintLaps.reduce((sum, laps) => sum + laps, 0);
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (count(place(middle)) <= changes) high = middle;
    else low = middle + 1;
  }
  return place(low);
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
  if (!isNumber(c.tyreChange2Seconds) || c.tyreChange2Seconds < 0) return "The tyre change time cannot be negative.";
  if (!isNumber(c.tyreChange4Seconds) || c.tyreChange4Seconds < 0) return "The tyre change time cannot be negative.";
  if (!isNumber(c.driverSwapSeconds) || c.driverSwapSeconds < 0) return "The driver swap time cannot be negative.";
  if (!isNumber(c.tyreWearPerLap) || c.tyreWearPerLap < 0) return "The tyre wear per lap cannot be negative.";
  if (!isNumber(c.tyreMinCondition) || c.tyreMinCondition < 0 || c.tyreMinCondition >= 100) {
    return "The minimum tyre condition must be between 0 and 99 percent.";
  }
  if (c.maxTyres !== null && (!Number.isInteger(c.maxTyres) || c.maxTyres < 4)) {
    return "The number of tyres must be a whole number of at least 4 (the four you start on).";
  }
  return null;
}

// Stops the loop if the inputs describe an absurd race (for example 1-lap stints for 24 hours).
const MAX_STINTS = 2000;

/** Numbers worked out once from the input and used by every simulation. */
interface Setup {
  drivers: string[];
  swapping: boolean;
  /** Laps on a full tank. */
  tankLaps: number;
  /** Laps on the fuel the car starts with. */
  firstFuelLaps: number;
  /** Laps new tyres last above the minimum. */
  tyreLaps: number;
}

/**
 * When to change each of the two tyre pairs.
 * null: change a pair whenever it would go under the minimum in the next stint.
 * Otherwise: a fixed list per pair with true/false for every stop.
 */
type Schedule = [boolean[], boolean[]] | null;

/** Drive the whole race once, with the given rule for tyre changes. */
function simulate(c: PlanInput, setup: Setup, schedule: Schedule): PlanResult {
  const { drivers, swapping, tankLaps, firstFuelLaps, tyreLaps } = setup;
  // With a fixed schedule the tyres may go under the minimum, so only fuel limits a stint.
  const fullStintLaps = schedule ? tankLaps : Math.min(tankLaps, tyreLaps);

  const stints: Stint[] = [];
  let clock = 0;
  let lapNo = 0;
  let fuel = c.startFuelLitres;
  // Laps driven on each of the two tyre pairs.
  const pairLaps: [number, number] = [0, 0];
  let tyresUsed = 4;
  // Laps the car is fuelled and "tyred" for in the coming stint.
  let plannedLaps = Math.min(firstFuelLaps, fullStintLaps);

  for (let i = 0; ; i++) {
    if (i >= MAX_STINTS) return fail("This plan needs more than 2000 stints. Check the inputs.");

    const needed = lapsToFinish(c.raceSeconds - clock, c.lapSeconds);
    const final = needed <= plannedLaps;
    const laps = final ? needed : plannedLaps;
    const driverIndex = swapping ? i % drivers.length : 0;

    const end = clock + laps * c.lapSeconds;
    const fuelAtEnd = fuel - laps * c.fuelPerLap;
    pairLaps[0] += laps;
    pairLaps[1] += laps;
    const conditions = pairLaps.map((l) => 100 - c.tyreWearPerLap * l).sort((a, b) => a - b);
    const worst = conditions[0] ?? 100;

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
      tyresAtEnd: [worst, conditions[1] ?? 100],
      tyreBelowMin: c.tyreWearPerLap > 0 && worst < c.tyreMinCondition - EPS,
      final,
      stop: null,
    };
    lapNo += laps;
    stints.push(stint);
    if (final) break;

    // Which pairs get new tyres at this stop, for a next stint of n laps.
    const pairsToChange = (n: number): [boolean, boolean] => {
      if (schedule) return [schedule[0][i] ?? false, schedule[1][i] ?? false];
      const wornOut = (l: number): boolean => 100 - c.tyreWearPerLap * (l + n) < c.tyreMinCondition - EPS;
      return [wornOut(pairLaps[0]), wornOut(pairLaps[1])];
    };

    // Work out the stop for a next stint of n laps.
    const stopFor = (n: number): { stop: PitStop; pairs: [boolean, boolean] } => {
      const target = Math.min(c.tankLitres, (n + c.marginLaps) * c.fuelPerLap);
      let fuelAdded = target - fuelAtEnd;
      if (fuelAdded < EPS) fuelAdded = 0;
      const pairs = pairsToChange(n);
      const tyresChanged = ((pairs[0] ? 2 : 0) + (pairs[1] ? 2 : 0)) as TyresChanged;
      const tyreSeconds = tyresChanged === 4 ? c.tyreChange4Seconds : tyresChanged === 2 ? c.tyreChange2Seconds : 0;
      const stationary = stationarySeconds(
        fuelAdded / c.refuelRate,
        tyreSeconds,
        swapping ? c.driverSwapSeconds : 0,
        c.simultaneousService,
      );
      return {
        pairs,
        stop: { fuelAdded, tyresChanged, stationarySeconds: stationary, pitSeconds: c.pitLaneLossSeconds + stationary },
      };
    };

    // A shorter stop leaves more race time, which can mean one more lap to drive.
    // So look for the smallest next stint that still reaches the finish with its own stop time.
    // If there is none, the next stint is a normal full stint.
    let nextLaps = fullStintLaps;
    let chosen = stopFor(fullStintLaps);
    for (let n = 1; n < fullStintLaps; n++) {
      const candidate = stopFor(n);
      const lapsAfterStop = lapsToFinish(c.raceSeconds - end - candidate.stop.pitSeconds, c.lapSeconds);
      if (lapsAfterStop <= n) {
        nextLaps = n;
        chosen = candidate;
        break;
      }
    }

    stint.stop = chosen.stop;
    clock = end + chosen.stop.pitSeconds;
    fuel = fuelAtEnd + chosen.stop.fuelAdded;
    if (chosen.pairs[0]) pairLaps[0] = 0;
    if (chosen.pairs[1]) pairLaps[1] = 0;
    tyresUsed += chosen.stop.tyresChanged;
    plannedLaps = nextLaps;
  }

  const perDriverMap = new Map<number, DriverTime>();
  let pitSecondsTotal = 0;
  let lowest = stints[0];
  for (const s of stints) {
    if (s.stop) pitSecondsTotal += s.stop.pitSeconds;
    if (lowest && s.tyresAtEnd[0] < lowest.tyresAtEnd[0] - EPS) lowest = s;
    const entry = perDriverMap.get(s.driverIndex) ?? { driver: s.driver, driverIndex: s.driverIndex, seconds: 0 };
    entry.seconds += s.endSeconds - s.startSeconds;
    perDriverMap.set(s.driverIndex, entry);
  }

  const last = stints[stints.length - 1];
  return {
    ok: true,
    stints,
    fullStintLaps,
    stintLimitedBy: !schedule && tyreLaps < tankLaps ? "tyres" : "fuel",
    totalLaps: lapNo,
    stops: stints.length - 1,
    tyresUsed,
    tyreStrategy: schedule ? "spread" : "asNeeded",
    lowestTyre: lowest ? lowest.tyresAtEnd[0] : 100,
    lowestTyreStint: lowest ? lowest.n : 1,
    pitSecondsTotal,
    finishSeconds: last ? last.endSeconds : 0,
    drivers,
    swapping,
    perDriver: [...perDriverMap.values()],
  };
}

/** Plan with too few tyres to stay above the minimum: spread the changes over the race. */
function planWithSpreadTyres(c: PlanInput, setup: Setup, maxTyres: number): PlanResult {
  // Tyres are changed per pair. The four starting tyres are not available for changes.
  const pairChanges = Math.floor((maxTyres - 4) / 2);
  const forPairA = Math.ceil(pairChanges / 2);
  const forPairB = Math.floor(pairChanges / 2);

  // The stops move a little when tyre changes are added or removed, because the pit time changes.
  // So: plan, place the changes on those stints, plan again, and repeat until the stints stay the same.
  let result = simulate(c, setup, [[], []]);
  for (let round = 0; round < 6 && result.ok; round++) {
    const stintLaps = result.stints.map((s) => s.laps);
    const next = simulate(c, setup, [spreadChanges(stintLaps, forPairA), spreadChanges(stintLaps, forPairB)]);
    if (!next.ok) return next;
    const settled = next.stints.length === stintLaps.length && next.stints.every((s, i) => s.laps === stintLaps[i]);
    result = next;
    if (settled) break;
  }
  return result;
}

export function planRace(c: PlanInput): PlanResult {
  const problem = validate(c);
  if (problem) return fail(problem);

  const drivers = c.drivers.length > 0 ? c.drivers : ["Driver 1"];
  const setup: Setup = {
    drivers,
    swapping: c.rotateDrivers && drivers.length > 1,
    tankLaps: fuelStintLaps(c.tankLitres, c.fuelPerLap, c.marginLaps),
    firstFuelLaps: fuelStintLaps(c.startFuelLitres, c.fuelPerLap, c.marginLaps),
    tyreLaps: tyreStintLaps(c.tyreWearPerLap, c.tyreMinCondition),
  };
  if (setup.tankLaps < 1) {
    return fail("The tank cannot cover one lap plus the safety margin. Raise the tank size or lower the margin.");
  }
  if (setup.firstFuelLaps < 1) {
    return fail("The fuel at the start cannot cover one lap plus the safety margin.");
  }

  // First choice: change tyres whenever they would go under the minimum.
  // New tyres that cannot even do one lap above the minimum make that impossible.
  const asNeeded = setup.tyreLaps >= 1 ? simulate(c, setup, null) : null;
  if (asNeeded && !asNeeded.ok) return asNeeded;
  if (asNeeded && (c.maxTyres === null || asNeeded.tyresUsed <= c.maxTyres)) return asNeeded;

  if (c.maxTyres === null) {
    return fail("New tyres drop below your minimum within one lap. Lower the wear or the minimum.");
  }
  // Not enough tyres for that. Use the tyres there are as evenly as possible.
  return planWithSpreadTyres(c, setup, c.maxTyres);
}
