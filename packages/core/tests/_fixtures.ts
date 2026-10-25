import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const fixturePath = (name: string): string => fileURLToPath(new URL(`../../../fixtures/${name}`, import.meta.url));
export const readFixture = (name: string): string => readFileSync(fixturePath(name), "utf8");
export const readJson = <T = unknown>(name: string): T => JSON.parse(readFixture(name)) as T;
