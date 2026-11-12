// All times are in seconds, all fuel in litres, tyre condition in percent (100 = new).

export interface PlanInput {
  /** Race length. */
  raceSeconds: number;
  /** Average lap time. */
  lapSeconds: number;
  fuelPerLap: number;
  tankLitres: number;
  /** Laps of fuel that always stay in the tank. */
  marginLaps: number;
  /** Fuel in the car at the start of the race. */
  startFuelLitres: number;

  /** Time lost driving through the pit lane, without standing still. */
  pitLaneLossSeconds: number;
  /** Litres per second. */
  refuelRate: number;
  /** Time to change two tyres, and time to change all four. */
  tyreChange2Seconds: number;
  tyreChange4Seconds: number;
  driverSwapSeconds: number;
  /** true: refuelling and the tyre change happen at the same time. false: one after the other. */
  simultaneousService: boolean;

  /** Tyre condition lost per lap, in percent points. All tyres wear at this rate. 0 means tyres are never changed. */
  tyreWearPerLap: number;
  /** The tyre condition (percent) the user does not want to go below. */
  tyreMinCondition: number;
  /**
   * Single tyres you may use in the whole race, counting the four you start on.
   * null means no limit. Tyres are changed two or four at a time.
   */
  maxTyres: number | null;

  drivers: string[];
  /** Change driver at every stop (only has an effect with more than one driver). */
  rotateDrivers: boolean;
}

/** How many tyres are changed at a stop. Never one or three. */
export type TyresChanged = 0 | 2 | 4;

export interface PitStop {
  fuelAdded: number;
  tyresChanged: TyresChanged;
  /** Time standing still in the pit box. */
  stationarySeconds: number;
  /** Pit lane loss plus stationary time. */
  pitSeconds: number;
}

export interface Stint {
  /** Stint number, starting at 1. */
  n: number;
  driver: string;
  /** Position of the driver in the driver list. Used for colours. */
  driverIndex: number;
  /** Race clock when the stint starts and ends. */
  startSeconds: number;
  endSeconds: number;
  firstLap: number;
  lastLap: number;
  laps: number;
  fuelAtStart: number;
  fuelAtEnd: number;
  /**
   * The car has two pairs of tyres that can be changed separately.
   * These are the conditions of both pairs when the stint ends, most worn first.
   */
  tyresAtEnd: [number, number];
  /** true when the most worn pair ends this stint under the minimum. */
  tyreBelowMin: boolean;
  /** true for the stint that takes the chequered flag. */
  final: boolean;
  /** The stop after this stint. null for the final stint. */
  stop: PitStop | null;
}

export interface DriverTime {
  driver: string;
  driverIndex: number;
  seconds: number;
}

export interface Plan {
  ok: true;
  stints: Stint[];
  /** Laps of a normal full stint. */
  fullStintLaps: number;
  /** What limits a full stint: the fuel tank or the tyres. */
  stintLimitedBy: "fuel" | "tyres";
  totalLaps: number;
  stops: number;
  /** Single tyres used, counting the four the car starts on. */
  tyresUsed: number;
  /**
   * "asNeeded": tyres are changed whenever they would go under the minimum.
   * "spread": there are too few tyres for that, so the changes are spread evenly over the race.
   */
  tyreStrategy: "asNeeded" | "spread";
  /** The lowest tyre condition in the race, and the stint where it happens. */
  lowestTyre: number;
  lowestTyreStint: number;
  pitSecondsTotal: number;
  /** Race clock when the car crosses the finish line. */
  finishSeconds: number;
  drivers: string[];
  swapping: boolean;
  perDriver: DriverTime[];
}

export interface PlanError {
  ok: false;
  error: string;
}

export type PlanResult = Plan | PlanError;
