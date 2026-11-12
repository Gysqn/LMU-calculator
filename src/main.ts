import "./style.css";
import { planRace } from "./calc/plan";
import type { Plan } from "./calc/types";
import { raceLengthMinutes, readForm, resetForm, restoreForm, saveForm, setRaceLength, showErrors } from "./ui/form";
import { planText } from "./ui/planText";
import { renderMessage, renderPlan, stintInfo } from "./ui/render";
import { initTheme } from "./ui/theme";

// Entry point: connects the form to the calculation and the page.

function element<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error("Missing element: " + id);
  return el as T;
}

const form = element<HTMLFormElement>("form");
const out = element<HTMLDivElement>("out");
const presets = element<HTMLDivElement>("presets");
const jump = element<HTMLAnchorElement>("jump");
let lastText = "";
let lastPlan: Plan | null = null;

function update(): void {
  saveForm();
  markPreset();
  const read = readForm();
  showErrors(read.errors);
  lastPlan = null;

  if (!read.input) {
    const count = Object.keys(read.errors).length;
    out.innerHTML = renderMessage("No plan yet", count === 1 ? "Fix the field marked in red." : "Fix the " + count + " fields marked in red.");
    jump.textContent = ""; // an empty bar is hidden by the stylesheet
    return;
  }
  const result = planRace(read.input);
  if (!result.ok) {
    out.innerHTML = renderMessage("This cannot be planned", result.error);
    jump.textContent = "See what is wrong ↓";
    return;
  }
  lastPlan = result;
  lastText = planText(read.input, result);
  out.innerHTML = renderPlan(result);
  jump.textContent = result.totalLaps + " laps · " + result.stops + (result.stops === 1 ? " stop" : " stops") + " · view plan ↓";
}

/** Highlight the preset button that matches the typed race length. */
function markPreset(): void {
  const minutes = raceLengthMinutes();
  for (const button of presets.querySelectorAll("button")) {
    button.classList.toggle("on", Number(button.dataset.hours) * 60 === minutes);
  }
}

/** Show one stint's details under the timeline and highlight it in the table. */
function selectStint(n: number): void {
  const stint = lastPlan?.stints.find((s) => s.n === n);
  const info = document.getElementById("info");
  if (!stint || !info) return;
  info.innerHTML = stintInfo(stint);
  info.classList.add("picked");
  for (const el of out.querySelectorAll<HTMLElement>("[data-stint]")) {
    el.classList.toggle("on", Number(el.dataset.stint) === n);
  }
}

function stintOf(target: EventTarget | null): number | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest<HTMLElement>("[data-stint]");
  return el ? Number(el.dataset.stint) : null;
}

function copyPlan(): void {
  const status = element<HTMLSpanElement>("copied");
  const showText = (): void => {
    const area = element<HTMLTextAreaElement>("plain");
    area.value = lastText;
    area.hidden = false;
    area.select();
    status.textContent = "Copying is blocked here. Select the text below and copy it.";
  };
  if (!navigator.clipboard) {
    showText();
    return;
  }
  navigator.clipboard.writeText(lastText).then(() => {
    status.textContent = "Copied to clipboard.";
  }, showText);
}

// The reset button asks for a second click, so one slip does not wipe the form.
function initReset(button: HTMLButtonElement): void {
  let timer: number | undefined;
  const disarm = (): void => {
    window.clearTimeout(timer);
    button.textContent = "Reset";
    button.classList.remove("armed");
  };
  button.addEventListener("click", () => {
    if (!button.classList.contains("armed")) {
      button.textContent = "Click again to reset";
      button.classList.add("armed");
      timer = window.setTimeout(disarm, 4000);
      return;
    }
    disarm();
    resetForm();
    update();
  });
}

restoreForm();
initTheme(element("theme"));
initReset(element<HTMLButtonElement>("reset"));

form.addEventListener("input", update);
form.addEventListener("submit", (e) => e.preventDefault());
presets.addEventListener("click", (e) => {
  if (e.target instanceof HTMLButtonElement && e.target.dataset.hours) {
    setRaceLength(Number(e.target.dataset.hours));
    update();
  }
});

// The results are redrawn with every update, so listen on their container.
out.addEventListener("click", (e) => {
  if (e.target instanceof HTMLElement && e.target.id === "copy") {
    copyPlan();
    return;
  }
  const n = stintOf(e.target);
  if (n !== null) selectStint(n);
});
out.addEventListener("pointerover", (e) => {
  // Only for a mouse: on a touch screen a tap already selects.
  if (e.pointerType !== "mouse" || !(e.target instanceof Element) || !e.target.closest(".seg")) return;
  const n = stintOf(e.target);
  if (n !== null) selectStint(n);
});
out.addEventListener("focusin", (e) => {
  const n = stintOf(e.target);
  if (n !== null) selectStint(n);
});

// On a phone the plan sits below the form. A small bar at the bottom links to it
// and hides once the plan is on screen.
new IntersectionObserver((entries) => {
  jump.hidden = entries.some((entry) => entry.isIntersecting);
}).observe(out);

update();
