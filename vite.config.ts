import { defineConfig } from "vite";

export default defineConfig({
  // Relative paths, so the built site works in a sub-folder such as
  // https://name.github.io/lmu-stint-planner/ as well as at the root of a domain.
  base: "./",
});
