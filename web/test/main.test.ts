import { describe, expect, it, vi } from "vitest";

vi.mock("../src/wasm/signal_jam_core.js", () => ({
  default: async () => {},
  greet: () => "Signal Jam core online",
}));

describe("bootstrap", () => {
  it("renders the WASM greeting into #boot-status", async () => {
    document.body.innerHTML = '<div id="app"><p id="boot-status">loading…</p></div>';

    await import("../src/main.ts");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.querySelector("#boot-status")?.textContent).toBe(
      "Signal Jam core online",
    );
  });
});
