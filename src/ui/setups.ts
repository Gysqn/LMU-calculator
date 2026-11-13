import { applyForm, collectForm, type FormData } from "./form";

// Named setups: save the form under a name (a car, a track, a race) and load it again later.
// They live in this browser, next to the form itself.

const STORAGE_KEY = "stint-planner-setups";

type Setups = Record<string, FormData>;

function load(): Setups {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (typeof saved === "object" && saved !== null && !Array.isArray(saved)) return saved as Setups;
  } catch {
    // Unreadable or blocked storage: start with no setups.
  }
  return {};
}

function store(setups: Setups): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(setups));
    return true;
  } catch {
    return false;
  }
}

function get<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error("Missing element: " + id);
  return el as T;
}

export function initSetups(onLoad: () => void): void {
  const pick = get<HTMLSelectElement>("setupPick");
  const name = get<HTMLInputElement>("setupName");
  const save = get<HTMLButtonElement>("setupSave");
  const remove = get<HTMLButtonElement>("setupDelete");
  const message = get<HTMLElement>("setupMsg");
  let setups = load();

  const say = (text: string): void => {
    message.textContent = text;
  };

  const fillList = (selected: string): void => {
    const names = Object.keys(setups).sort((a, b) => a.localeCompare(b));
    pick.replaceChildren(
      new Option(names.length > 0 ? "Choose a setup…" : "No saved setups yet", ""),
      ...names.map((n) => new Option(n, n)),
    );
    pick.value = names.includes(selected) ? selected : "";
    pick.disabled = names.length === 0;
    remove.disabled = pick.value === "";
  };

  pick.addEventListener("change", () => {
    const chosen = setups[pick.value];
    remove.disabled = pick.value === "";
    if (!chosen) return;
    applyForm(chosen);
    name.value = pick.value;
    say('Loaded "' + pick.value + '".');
    onLoad();
  });

  save.addEventListener("click", () => {
    const wanted = name.value.trim();
    if (wanted === "") {
      say("Type a name first, for example the car and the track.");
      name.focus();
      return;
    }
    const existed = wanted in setups;
    setups = { ...setups, [wanted]: collectForm(false) };
    if (!store(setups)) {
      say("Saving is blocked in this browser.");
      return;
    }
    fillList(wanted);
    say((existed ? "Updated" : "Saved") + ' "' + wanted + '".');
  });

  remove.addEventListener("click", () => {
    const chosen = pick.value;
    if (chosen === "") return;
    // Ask for a second click, so one slip does not delete a setup.
    if (!remove.classList.contains("armed")) {
      remove.classList.add("armed");
      remove.textContent = "Click again";
      window.setTimeout(() => {
        remove.classList.remove("armed");
        remove.textContent = "Delete";
      }, 4000);
      return;
    }
    remove.classList.remove("armed");
    remove.textContent = "Delete";
    const rest = { ...setups };
    delete rest[chosen];
    setups = rest;
    store(setups);
    fillList("");
    name.value = "";
    say('Deleted "' + chosen + '". The form itself is unchanged.');
  });

  // Enter in the name box saves.
  name.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save.click();
    }
  });

  fillList("");
}
