// Converting between text and seconds. These are the "edges": everything else works in seconds.

/**
 * Read a lap time such as "3:32.0", "3:32,5" or "212.5" (plain seconds).
 * Returns the time in seconds, or null when the text is not a valid lap time.
 */
export function parseLapTime(text: string): number | null {
  const s = text.trim().replace(",", ".");
  const withMinutes = /^(\d+):([0-5]?\d(?:\.\d+)?)$/.exec(s);
  if (withMinutes) {
    return Number(withMinutes[1]) * 60 + Number(withMinutes[2]);
  }
  if (/^\d+(?:\.\d+)?$/.test(s)) {
    return Number(s);
  }
  return null;
}

function pad2(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

/** 21600 -> "6:00:00" */
export function formatHms(seconds: number): string {
  const sec = Math.round(seconds);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h + ":" + pad2(m) + ":" + pad2(sec % 60);
}

/** 125 -> "2:05" */
export function formatMs(seconds: number): string {
  const sec = Math.round(seconds);
  return Math.floor(sec / 60) + ":" + pad2(sec % 60);
}

/** 212 -> "3:32.0" */
export function formatLapTime(seconds: number): string {
  // Work in tenths so 59.96 becomes 1:00.0 and not 0:60.0.
  const tenths = Math.round(seconds * 10);
  const m = Math.floor(tenths / 600);
  const rest = tenths - m * 600;
  return m + ":" + (rest < 100 ? "0" : "") + (rest / 10).toFixed(1);
}
