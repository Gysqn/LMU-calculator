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
  tyreChangeSeconds: number;
  driverSwapSeconds: number;
  /** true: refuelling and the tyre change happen at the same time. false: one after the other. */
  simultaneousService: boolean;

  /** Tyre condition lost per lap, in percent points. 0 means tyres are never changed. */
  tyreWearPerLap: number;
  /** Lowest tyre condition (percent) the user is willing to drive on. */
  tyreMinCondition: number;

  drivers: string[];
  /** Change driver at every stop (only has an effect with more than one driver). */
  rotateDrivers: boolean;
}

export interface PitStop {
  fuelAdded: number;
  tyresChanged: boolean;
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
  tyreAtStart: number;
  tyreAtEnd: number;
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
  /** Laps of a normal full stint (full tank, new tyres). */
  fullStintLaps: number;
  /** What limits a full stint: the fuel tank or the tyres. */
  stintLimitedBy: "fuel" | "tyres";
  totalLaps: number;
  stops: number;
  tyreChanges: number;
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
