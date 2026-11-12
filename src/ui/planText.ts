import { formatHms, formatLapTime } from "../calc/time";
import type { LiveState, Plan, PlanInput } from "../calc/types";

/** The plan as plain text, for pasting into a chat with your team. */
export function planText(c: PlanInput, r: Plan, live: LiveState | null = null): string {
  const stops = r.stops + (r.stops === 1 ? " stop" : " stops");
  const lines = [
    live
      ? "Re-plan from lap " + (live.lapsDone + 1) + ": " + formatHms(live.timeLeftSeconds) + " left, " +
        r.totalLaps + " laps in total, " + stops + " to go"
      : "Stint plan: " + formatHms(c.raceSeconds) + " race, " + formatLapTime(c.lapSeconds) + " laps, " +
        r.totalLaps + " laps, " + stops,
    "",
  ];
  for (const s of r.stints) {
    let line = "Stint " + s.n + " | " + s.driver + " | laps " + s.firstLap + "-" + s.lastLap +
      " | " + formatHms(s.startSeconds) + " to " + formatHms(s.endSeconds);
    if (s.stop) {
      line += " | box, add " + s.stop.fuelAdded.toFixed(1) + " L, " +
        (s.stop.tyresChanged ? s.stop.tyresChanged + " new tyres" : "keep tyres") + ", " + s.stop.pitSeconds.toFixed(0) + " s in the pits";
    } else {
      line += " | finish";
    }
    lines.push(line);
  }
  return lines.join("\n");
}
