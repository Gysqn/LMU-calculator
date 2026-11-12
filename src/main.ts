// Entry point. The real UI arrives in step 5; this only proves the setup works.
const app = document.querySelector<HTMLDivElement>("#app");
if (app) {
  app.textContent = "Stint Planner: project setup works.";
}
