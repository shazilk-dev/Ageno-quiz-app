import { parseQuizJson } from "@/lib/quiz-format/read";
import type { ParsedImport } from "@/lib/quiz-format/types";
import { detectColumns, missingColumns, parseSpreadsheetText } from "./spreadsheet";
import { parseTable } from "./table";
import { parseQuizText } from "./text";

// One entry point for every way in. All of them end in the same `ParsedImport`.

export type ImportRoute = "json" | "sheet" | "text";

export const ROUTE_LABELS: Record<ImportRoute, string> = {
  json: "JSON (from an AI)",
  sheet: "Spreadsheet or CSV",
  text: "Plain text",
};

/** Guesses what a pasted text or file is: JSON starts with { or [, a sheet has the column names in its first row. */
export function detectRoute(text: string): ImportRoute {
  const trimmed = text.replace(/^﻿/, "").trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
  const header = parseTable(trimmed.slice(0, 20_000)).records.find(
    (record) => record.some((cell) => cell.trim()) && !(record.find((cell) => cell.trim())?.trim().startsWith("#") ?? false)
  );
  if (header && missingColumns(detectColumns(header).fields).length === 0) return "sheet";
  return "text";
}

/** The route a file name suggests, or null when it says nothing. */
export function routeForFile(name: string): ImportRoute | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".json")) return "json";
  if (/\.(csv|tsv)$/.test(lower)) return "sheet";
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return "text";
  return null;
}

export function readImport(text: string, route: ImportRoute | "auto"): { parsed: ParsedImport; route: ImportRoute } {
  const chosen = route === "auto" ? detectRoute(text) : route;
  const parsed =
    chosen === "json" ? parseQuizJson(text) : chosen === "sheet" ? parseSpreadsheetText(text) : parseQuizText(text);
  return { parsed, route: chosen };
}
