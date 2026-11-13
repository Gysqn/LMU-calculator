// The driver list: one box per driver, with buttons to add, remove and move up.

// Three empty boxes. An empty box shows "Driver 1" and so on, and the plan uses that name.
export const DEFAULT_DRIVERS = ["", "", ""];

let list: HTMLElement | null = null;
let changed: () => void = () => {};

function inputs(): HTMLInputElement[] {
  return list ? [...list.querySelectorAll<HTMLInputElement>("input")] : [];
}

/** The text in each box, exactly as typed. */
export function driverBoxes(): string[] {
  return inputs().map((input) => input.value);
}

/** The names used in the plan. An empty box becomes "Driver 2" and so on. */
export function driverNames(): string[] {
  return driverBoxes().map((value, i) => value.trim() || "Driver " + (i + 1));
}

function iconButton(action: string, text: string, label: string, disabled: boolean): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon";
  button.dataset.act = action;
  button.textContent = text;
  button.setAttribute("aria-label", label);
  button.title = label;
  button.disabled = disabled;
  return button;
}

/** Redraw the list with these names. */
export function setDriverBoxes(names: string[]): void {
  if (!list) return;
  const values = names.length > 0 ? names : [""];
  list.replaceChildren();
  values.forEach((value, i) => {
    const row = document.createElement("div");
    row.className = "drow";
    row.dataset.index = String(i);

    const chip = document.createElement("i");
    chip.className = "chip";
    chip.style.background = "var(--d" + ((i % 4) + 1) + ")";

    const box = document.createElement("span");
    box.className = "in";
    const input = document.createElement("input");
    input.type = "text";
    input.value = value;
    input.placeholder = "Driver " + (i + 1);
    input.setAttribute("aria-label", "Driver " + (i + 1) + " name");
    box.append(input);

    row.append(
      chip,
      box,
      iconButton("up", "↑", "Move driver " + (i + 1) + " up", i === 0),
      iconButton("remove", "×", "Remove driver " + (i + 1), values.length === 1),
    );
    list?.append(row);
  });
}

function focusBox(index: number): void {
  inputs()[index]?.focus();
}

export function addDriver(): void {
  const values = driverBoxes();
  values.push("");
  setDriverBoxes(values);
  focusBox(values.length - 1);
  changed();
}

export function initDrivers(container: HTMLElement, addButton: HTMLElement, onChange: () => void): void {
  list = container;
  changed = onChange;
  setDriverBoxes(DEFAULT_DRIVERS);

  addButton.addEventListener("click", addDriver);

  container.addEventListener("click", (e) => {
    if (!(e.target instanceof HTMLButtonElement)) return;
    const row = e.target.closest<HTMLElement>(".drow");
    if (!row) return;
    const i = Number(row.dataset.index);
    const values = driverBoxes();
    if (e.target.dataset.act === "remove" && values.length > 1) {
      values.splice(i, 1);
      setDriverBoxes(values);
      focusBox(Math.min(i, values.length - 1));
    } else if (e.target.dataset.act === "up" && i > 0) {
      const moved = values[i] ?? "";
      values[i] = values[i - 1] ?? "";
      values[i - 1] = moved;
      setDriverBoxes(values);
      focusBox(i - 1);
    } else {
      return;
    }
    changed();
  });

  // Enter in a name box jumps to the next box, or adds a new driver after the last one.
  container.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !(e.target instanceof HTMLInputElement)) return;
    e.preventDefault();
    const i = inputs().indexOf(e.target);
    if (i === inputs().length - 1) addDriver();
    else focusBox(i + 1);
  });
}
