import { formatHm, formatHms, formatMs } from "../calc/time";
import type { Plan, Stint } from "../calc/types";

// Turns a plan into HTML. Everything the user typed goes through esc() first.

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function esc(s: string | number): string {
  return String(s).replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/** There are four driver colours; a fifth driver reuses the first. */
function colour(driverIndex: number): string {
  return "var(--d" + ((driverIndex % 4) + 1) + ")";
}

export function renderMessage(title: string, text: string): string {
  return '<div class="msg" role="status"><strong>' + esc(title) + "</strong><span>" + esc(text) + "</span></div>";
}

function tile(key: string, value: string | number, sub: string): string {
  return '<div class="tile"><div class="k">' + esc(key) + '</div><div class="v">' + esc(value) + '</div><div class="s">' + esc(sub) + "</div></div>";
}

function renderTiles(r: Plan): string {
  const perStop = r.stops > 0 ? "about " + (r.pitSecondsTotal / r.stops).toFixed(0) + " s per stop" : "no stops needed";
  const limit = r.stintLimitedBy === "tyres" ? "tyres" : "fuel";
  return '<div class="tiles">' +
    tile("Total laps", r.totalLaps, "finish at " + formatHms(r.finishSeconds)) +
    tile("Pit stops", r.stops, r.tyresUsed + " tyres used") +
    tile("Time in pits", formatMs(r.pitSecondsTotal), perStop) +
    tile("Full stint", r.fullStintLaps + " laps", "limited by " + limit) +
    "</div>";
}

function tyresText(changed: number): string {
  if (changed === 4) return "4 new tyres";
  if (changed === 2) return "2 new tyres (the most worn pair)";
  return "keep tyres";
}

/** Tyre condition for display. Worn-out tyres cannot go below 0%. */
function pct(condition: number): string {
  return Math.max(0, condition).toFixed(0);
}

/** One line that describes a stint. Shown under the timeline when a stint is picked. */
export function stintInfo(s: Stint): string {
  let html = "<strong>Stint " + s.n + " · " + esc(s.driver) + "</strong> " +
    "laps " + s.firstLap + "–" + s.lastLap + " (" + s.laps + ") · " +
    formatHms(s.startSeconds) + " to " + formatHms(s.endSeconds) + " · ";
  if (s.stop) {
    html += "then box: add " + s.stop.fuelAdded.toFixed(1) + " L, " +
      tyresText(s.stop.tyresChanged) + ", " + s.stop.pitSeconds.toFixed(0) + " s";
  } else {
    html += "takes the finish";
  }
  return html;
}

function axisTicks(total: number): string {
  // Pick the smallest step that gives at most six labels, so they fit on a phone.
  const steps = [300, 600, 900, 1800, 3600, 7200, 14400, 21600, 43200];
  const step = steps.find((s) => total / s <= 6) ?? 86400;
  let html = "";
  for (let t = 0; t < total; t += step) {
    const pct = (t / total) * 100;
    if (pct > 92) break; // too close to the right edge to fit a label
    html += '<span class="tick" style="left:' + pct.toFixed(3) + '%">' + formatHm(t) + "</span>";
  }
  return html;
}

function renderTimeline(r: Plan): string {
  const total = r.finishSeconds;
  let segs = "";
  for (const s of r.stints) {
    const width = ((s.endSeconds - s.startSeconds) / total) * 100;
    segs += '<button type="button" class="seg" data-stint="' + s.n + '" style="flex:' + width.toFixed(3) +
      " 1 0;background:" + colour(s.driverIndex) + '" aria-label="Stint ' + s.n + ", " + esc(s.driver) + '">' +
      (width > 7 ? "<span>" + esc(s.driver) + "</span>" : "") + "</button>";
    if (s.stop) {
      segs += '<div class="pit" style="flex:' + ((s.stop.pitSeconds / total) * 100).toFixed(3) + ' 1 0"></div>';
    }
  }
  return '<div class="panel"><h2>Race timeline</h2>' +
    '<div class="timeline">' + segs + "</div>" +
    '<div class="axis" aria-hidden="true">' + axisTicks(total) + "</div>" +
    '<p class="info" id="info">Tap or hover a stint to see its details. Striped blocks are pit stops.</p></div>';
}

function renderDrivers(r: Plan): string {
  const driving = r.perDriver.reduce((sum, d) => sum + d.seconds, 0);
  let rows = "";
  for (const d of r.perDriver) {
    const stints = r.stints.filter((s) => s.driverIndex === d.driverIndex).length;
    const share = driving > 0 ? (d.seconds / driving) * 100 : 0;
    rows += '<div class="driver">' +
      '<span class="name"><i class="chip" style="background:' + colour(d.driverIndex) + '"></i>' + esc(d.driver) + "</span>" +
      '<span class="meter"><i style="width:' + share.toFixed(1) + "%;background:" + colour(d.driverIndex) + '"></i></span>' +
      '<span class="time">' + formatHms(d.seconds) + "</span>" +
      '<span class="count">' + share.toFixed(0) + "% · " + stints + (stints === 1 ? " stint" : " stints") + "</span></div>";
  }
  return '<div class="panel"><h2>Time at the wheel</h2><div class="drivers">' + rows + "</div></div>";
}

function cell(label: string, html: string, cls = ""): string {
  // data-label is shown on phones, where each stint becomes a card instead of a table row.
  return "<td" + (cls ? ' class="' + cls + '"' : "") + ' data-label="' + label + '"><span>' + html + "</span></td>";
}

function renderTable(r: Plan): string {
  let rows = "";
  for (const s of r.stints) {
    const stop = s.stop;
    // After a two-tyre change the two pairs have a different age. Show both, most worn first.
    const worst = pct(s.tyresAtEnd[0]);
    const best = pct(s.tyresAtEnd[1]);
    const tyres = '<span class="tyre' + (s.tyreBelowMin ? " low" : "") + '"><span class="meter"><i style="width:' + worst + '%"></i></span>' +
      worst + "%" + (best !== worst ? ' <span class="other">· ' + best + "%</span>" : "") + "</span>";
    const changed = stop?.tyresChanged ?? 0;
    rows += '<tr data-stint="' + s.n + '"' + (s.final ? ' class="final"' : "") + ">" +
      cell("Stint", String(s.n)) +
      cell("Driver", '<i class="chip" style="background:' + colour(s.driverIndex) + '"></i>' + esc(s.driver), "l") +
      cell("Laps", s.firstLap + "–" + s.lastLap) +
      cell("Count", String(s.laps)) +
      cell("Out", formatHms(s.startSeconds)) +
      cell("In", formatHms(s.endSeconds)) +
      cell("Fuel at start", s.fuelAtStart.toFixed(1) + " L") +
      cell("Tyres at end", tyres) +
      cell("Add fuel", stop ? stop.fuelAdded.toFixed(1) + " L" : '<span class="badge flag">Finish</span>') +
      cell("Tyres", stop ? (changed ? '<span class="badge new">' + changed + " new</span>" : '<span class="badge">Keep</span>') : "–") +
      cell("Pit time", stop ? stop.pitSeconds.toFixed(0) + " s" : "–") +
      "</tr>";
  }
  return '<div class="panel"><div class="panelhead"><h2>Stint sheet</h2>' +
    '<div class="row"><span id="copied" class="note" role="status"></span><button type="button" id="copy">Copy plan</button></div></div>' +
    '<div class="tablewrap"><table class="sheet"><thead>' +
    '<tr class="groups"><th colspan="8"></th><th colspan="3">At the stop after this stint</th></tr><tr>' +
    '<th>#</th><th class="l">Driver</th><th>Laps</th><th>Count</th><th>Out</th><th>In</th>' +
    "<th>Fuel at start</th><th>Tyres at end</th><th>Add fuel</th><th>Tyres</th><th>Pit time</th>" +
    "</tr></thead><tbody>" + rows + "</tbody></table></div>" +
    '<textarea id="plain" readonly hidden aria-label="Plan as plain text"></textarea>' +
    '<p class="note">Times are race clock (h:mm:ss). The last stint runs until the first lap that finishes after the clock hits zero. ' +
    "Tyre wear is a straight line and lap times stay the same on worn tyres. Traffic and safety cars are not modelled, so keep your margin.</p></div>";
}

function renderWarnings(r: Plan): string {
  if (r.tyreStrategy !== "spread" || !r.stints.some((s) => s.tyreBelowMin)) return "";
  return renderMessage(
    "Too few tyres to stay above your lowest condition",
    "The " + r.tyresUsed + " tyres are spread as evenly as possible over the race. They go down to " + pct(r.lowestTyre) +
      "% in stint " + r.lowestTyreStint + ". Stints below your lowest condition are marked in the stint sheet.",
  );
}

export function renderPlan(r: Plan): string {
  return renderWarnings(r) + renderTiles(r) + renderTimeline(r) + renderDrivers(r) + renderTable(r);
}
