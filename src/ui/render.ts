import { formatHms, formatMs } from "../calc/time";
import type { Plan } from "../calc/types";

// Turns a plan into HTML. Everything the user typed goes through esc() first.

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function esc(s: string | number): string {
  return String(s).replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/** There are four driver colours; a fifth driver reuses the first. */
function colour(driverIndex: number): string {
  return "var(--d" + ((driverIndex % 4) + 1) + ")";
}

export function renderMessage(text: string): string {
  return '<div class="msg">' + esc(text) + "</div>";
}

function tile(key: string, value: string | number, sub: string): string {
  return '<div class="tile"><div class="k">' + esc(key) + '</div><div class="v">' + esc(value) + '</div><div class="s">' + esc(sub) + "</div></div>";
}

function renderTiles(r: Plan): string {
  const perStop = r.stops > 0 ? (r.pitSecondsTotal / r.stops).toFixed(0) + " s per stop" : "No stops";
  const limit = r.stintLimitedBy === "tyres" ? ", limited by tyres" : "";
  return '<div class="tiles">' +
    tile("Total laps", r.totalLaps, "Finish at " + formatHms(r.finishSeconds)) +
    tile("Pit stops", r.stops, r.tyreChanges + " with new tyres") +
    tile("Time in pits", formatMs(r.pitSecondsTotal), perStop) +
    tile("Stints", r.stints.length, "Up to " + r.fullStintLaps + " laps" + limit) +
    "</div>";
}

function renderTimeline(r: Plan): string {
  const total = r.finishSeconds;
  let segs = "";
  for (const s of r.stints) {
    const width = ((s.endSeconds - s.startSeconds) / total) * 100;
    segs += '<div class="seg" style="flex:' + width.toFixed(3) + " 1 0;background:" + colour(s.driverIndex) +
      '" title="Stint ' + s.n + ", " + esc(s.driver) + '">' + (width > 5 ? esc(s.driver) : "") + "</div>";
    if (s.stop) {
      segs += '<div class="seg pit" style="flex:' + ((s.stop.pitSeconds / total) * 100).toFixed(3) +
        ' 1 0" title="Pit stop ' + s.n + '"></div>';
    }
  }
  let legend = "";
  for (const d of r.perDriver) {
    legend += '<span><i class="sw" style="background:' + colour(d.driverIndex) + '"></i>' + esc(d.driver) + " " +
      formatHms(d.seconds) + " at the wheel</span>";
  }
  legend += '<span><i class="sw" style="background:repeating-linear-gradient(45deg,var(--ink) 0 2px,var(--panel) 2px 4px)"></i>Pit stop</span>';

  return '<div class="panel"><h2>Race timeline</h2><div class="timeline">' + segs + "</div>" +
    '<div class="axis"><span>0:00</span><span>' + formatHms(total / 2) + "</span><span>" + formatHms(total) + "</span></div>" +
    '<div class="legend">' + legend + "</div></div>";
}

function renderTable(r: Plan): string {
  let rows = "";
  for (const s of r.stints) {
    const stop = s.stop;
    rows += "<tr" + (s.final ? ' class="final"' : "") + ">" +
      "<td>" + s.n + "</td>" +
      '<td class="l"><i class="chip" style="background:' + colour(s.driverIndex) + '"></i>' + esc(s.driver) + "</td>" +
      "<td>" + s.firstLap + "–" + s.lastLap + "</td>" +
      "<td>" + s.laps + "</td>" +
      "<td>" + formatHms(s.startSeconds) + "</td>" +
      "<td>" + formatHms(s.endSeconds) + "</td>" +
      "<td>" + s.fuelAtStart.toFixed(1) + "</td>" +
      "<td>" + s.tyreAtEnd.toFixed(0) + "%</td>" +
      "<td>" + (stop ? stop.fuelAdded.toFixed(1) : "Finish") + "</td>" +
      "<td>" + (stop ? (stop.tyresChanged ? '<span class="new">New</span>' : "Keep") : "–") + "</td>" +
      "<td>" + (stop ? stop.pitSeconds.toFixed(0) + " s" : "–") + "</td></tr>";
  }
  return '<div class="panel"><h2>Stint sheet</h2><div class="tablewrap"><table><thead><tr>' +
    '<th>#</th><th class="l">Driver</th><th>Laps</th><th>Count</th><th>Out</th><th>In</th>' +
    "<th>Fuel on board (L)</th><th>Tyres at end</th><th>Add at stop (L)</th><th>Tyres at stop</th><th>Pit time</th>" +
    "</tr></thead><tbody>" + rows + "</tbody></table></div>" +
    '<p class="note">Times are race clock (h:mm:ss). The last stint runs until the first lap that finishes after the clock hits zero. ' +
    "Tyre wear is a straight line and lap times stay the same on worn tyres. Traffic and safety cars are not modelled, so keep your margin.</p>" +
    '<div class="row" style="margin-top:12px"><button type="button" id="copy">Copy plan</button><span id="copied" class="note" style="margin:0"></span></div>' +
    '<textarea id="plain" readonly hidden aria-label="Plan as plain text"></textarea></div>';
}

export function renderPlan(r: Plan): string {
  return renderTiles(r) + renderTimeline(r) + renderTable(r);
}
