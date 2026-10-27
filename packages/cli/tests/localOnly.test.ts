import { describe, expect, it } from "vitest";
import { fromLocalProcess, isLocalHost, isLocalOrigin } from "../src/localOnly.js";

describe("local-only checks", () => {
  it("accepts loopback hosts with or without a port", () => {
    for (const h of ["127.0.0.1:4848", "localhost:4848", "[::1]:4848", "localhost"]) expect(isLocalHost(h), h).toBe(true);
  });
  it("refuses any other host, including rebinding names", () => {
    for (const h of [undefined, "", "evil.example:4848", "127.0.0.1.nip.io:4848", "localhost.evil.example", "0.0.0.0:4848"]) expect(isLocalHost(h as string | undefined), String(h)).toBe(false);
  });
  it("lets only this machine's own pages or non-browser clients open the live socket", () => {
    expect(isLocalOrigin(undefined)).toBe(true);
    expect(isLocalOrigin("http://127.0.0.1:4848")).toBe(true);
    expect(isLocalOrigin("http://localhost:5173")).toBe(true);
    for (const o of ["https://evil.example", "null", "http://127.0.0.1.evil.example", "file://"]) expect(isLocalOrigin(o), o).toBe(false);
  });
  it("only accepts hook posts from local processes", () => {
    expect(fromLocalProcess(undefined, undefined)).toBe(true);
    expect(fromLocalProcess(undefined, "none")).toBe(true);
    expect(fromLocalProcess("https://evil.example", "cross-site")).toBe(false);
    expect(fromLocalProcess(undefined, "cross-site")).toBe(false);
  });
});
