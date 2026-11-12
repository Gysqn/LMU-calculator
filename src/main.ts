import "./style.css";
import { planRace } from "./calc/plan";
import { readForm, restoreForm, saveForm } from "./ui/form";
import { planText } from "./ui/planText";
import { renderMessage, renderPlan } from "./ui/render";

// Entry point: connects the form to the calculation and the page.

function element<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error("Missing element: " + id);
  return el as T;
}

const form = element<HTMLFormElement>("form");
const out = element<HTMLDivElement>("out");
let lastText = "";

function update(): void {
  saveForm();
  const read = readForm();
  if (!read.ok) {
    out.innerHTML = renderMessage(read.error);
    return;
  }
  const result = planRace(read.input);
  if (!result.ok) {
    out.innerHTML = renderMessage(result.error);
    return;
  }
  lastText = planText(read.input, result);
  out.innerHTML = renderPlan(result);
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
    status.textContent = "Copied.";
  }, showText);
}

restoreForm();
form.addEventListener("input", update);
form.addEventListener("submit", (e) => e.preventDefault());
// The copy button is redrawn with every update, so listen on its container.
out.addEventListener("click", (e) => {
  if (e.target instanceof HTMLElement && e.target.id === "copy") copyPlan();
});
update();
