import { isTestPath } from "../adapters/paths.js";
import type { FileNode, PlaceKind } from "./types.js";

export const ARCHIVE_RE = /(^|\/)(schema\.(sql|prisma|graphql|gql)|.*\.(sql|prisma|db|sqlite)|migrations?\/|drizzle\/|models?\/.*\.(ts|js|py|rb)$)/i;
const IGNORE_RE = /(^|\/)(node_modules|\.git|dist|build|out|coverage|_site|\.next|\.turbo|target|vendor|__pycache__|\.venv|venv)(\/|$)|(^|\/)\.[^/]+$|\.(lock|map|min\.js|png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|mp4|mp3|pdf|zip)$/i;

export function isIgnoredPath(p: string): boolean {
  return IGNORE_RE.test(p);
}

export function kindOf(path: string): Exclude<PlaceKind, "forge" | "dock"> {
  if (isTestPath(path)) return "beacon";
  if (ARCHIVE_RE.test(path)) return "archive";
  return "building";
}

/** Lines, estimated from bytes when unknown (~40 bytes/line). */
export function locOf(f: FileNode): number {
  if (typeof f.loc === "number") return f.loc;
  if (typeof f.size === "number") return Math.max(1, Math.round(f.size / 40));
  return 1;
}

export interface Scored { file: FileNode; loc: number; score: number; kind: Exclude<PlaceKind, "forge" | "dock">; touched: boolean }

/**
 * 0.5·loc + 0.3·churn + 0.2·touched, each normalised to the repo's max.
 * Touched files are force-included by the caller regardless of score.
 */
export function scoreFiles(files: FileNode[], touched: Set<string>): Scored[] {
  const kept = files.filter((f) => !isIgnoredPath(f.path));
  const maxLoc = Math.max(1, ...kept.map(locOf));
  const maxChurn = Math.max(1, ...kept.map((f) => f.churn ?? 0));
  return kept.map((file) => {
    const loc = locOf(file);
    const t = touched.has(file.path);
    const score = 0.5 * Math.sqrt(loc / maxLoc) + 0.3 * ((file.churn ?? 0) / maxChurn) + (t ? 0.2 : 0);
    return { file, loc, score, kind: kindOf(file.path), touched: t };
  });
}

export function heightClass(loc: number, maxLoc: number): number {
  const r = Math.sqrt(loc / Math.max(1, maxLoc));
  return Math.max(1, Math.min(5, Math.ceil(r * 5)));
}

export function footprintOf(height: number): 1 | 2 | 3 {
  return height >= 5 ? 3 : height >= 3 ? 2 : 1;
}
