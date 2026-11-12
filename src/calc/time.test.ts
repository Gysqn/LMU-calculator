import { describe, expect, it } from "vitest";
import { formatHm, formatHms, formatLapTime, formatMs, parseLapTime } from "./time";

describe("parseLapTime", () => {
  it("reads minutes and seconds", () => {
    expect(parseLapTime("3:32.0")).toBe(212);
    expect(parseLapTime("3:32")).toBe(212);
    expect(parseLapTime("1:05.250")).toBeCloseTo(65.25, 9);
    expect(parseLapTime(" 3:32.5 ")).toBeCloseTo(212.5, 9);
  });

  it("accepts a comma as decimal sign", () => {
    expect(parseLapTime("3:32,5")).toBeCloseTo(212.5, 9);
  });

  it("reads plain seconds", () => {
    expect(parseLapTime("212")).toBe(212);
    expect(parseLapTime("97.3")).toBeCloseTo(97.3, 9);
  });

  it("returns null for text that is not a lap time", () => {
    expect(parseLapTime("")).toBeNull();
    expect(parseLapTime("abc")).toBeNull();
    expect(parseLapTime("3:75.0")).toBeNull(); // 75 seconds is not valid after a minute
    expect(parseLapTime("3:")).toBeNull();
    expect(parseLapTime("1:2:3")).toBeNull();
    expect(parseLapTime("-3:32")).toBeNull();
  });
});

describe("formatting", () => {
  it("formats hours, minutes and seconds", () => {
    expect(formatHms(0)).toBe("0:00:00");
    expect(formatHms(21600)).toBe("6:00:00");
    expect(formatHms(3725.4)).toBe("1:02:05");
  });

  it("formats hours and minutes", () => {
    expect(formatHm(0)).toBe("0:00");
    expect(formatHm(5400)).toBe("1:30");
    expect(formatHm(86400)).toBe("24:00");
  });

  it("formats minutes and seconds", () => {
    expect(formatMs(125)).toBe("2:05");
    expect(formatMs(59.6)).toBe("1:00");
  });

  it("formats a lap time", () => {
    expect(formatLapTime(212)).toBe("3:32.0");
    expect(formatLapTime(65.25)).toBe("1:05.3");
    expect(formatLapTime(59.96)).toBe("1:00.0");
  });
});
