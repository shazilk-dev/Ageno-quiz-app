// What the pre-release scan reports (docs/RICH_TEXT_PLAN.md, R2.4): stored text that would look different
// once it is shown as rich text. Pure, no database:
//   npx vitest run __tests__/rich-text-scan.test.ts
import { describe, expect, it } from "vitest";
import { normalizeQuestion } from "@/lib/exam/normalize";
import { parseRichText } from "@/lib/rich-text/parse";
import { firstLine, structureOf } from "@/lib/rich-text/plain";
import { changesFor, scanQuestion } from "@/lib/rich-text/scan";

describe("changesFor", () => {
  it("says nothing for text that renders the same", () => {
    for (const text of [
      "Which planet is closest to the sun?",
      "line one\nline two\n\nnew paragraph",
      "  extra   spaces\tand tabs ",
      "2*3*4 and snake_case_name and a_b_c",
      "a | b and 1. one and - dash",
      "5 > 3 and 2 < 4 and <b> and C:\\new",
      "",
    ]) {
      expect(changesFor(text, "blocks"), JSON.stringify(text)).toEqual([]);
    }
  });

  it("names the structure that would appear", () => {
    expect(changesFor("| a | b |\n|---|---|\n| 1 | 2 |", "blocks")).toEqual(["table"]);
    expect(changesFor("- a\n- b", "blocks")).toEqual(["list"]);
    expect(changesFor("```\nx\n```", "blocks")).toEqual(["code"]);
    expect(changesFor("Intro\n- a\n- b\n```\nx\n```", "blocks")).toEqual(["list", "code"]);
  });

  it("flags marks and escapes", () => {
    expect(changesFor("x**2 + y**2", "blocks")).toEqual(["marks"]);
    expect(changesFor("this is _important_", "blocks")).toEqual(["marks"]);
    expect(changesFor("use `ls -la`", "blocks")).toEqual(["marks"]);
    expect(changesFor("a \\* b", "blocks")).toEqual(["marks"]);
  });

  it("reads option text as inline: a table or list there is still plain text", () => {
    expect(changesFor("- a\n- b", "inline")).toEqual([]);
    expect(changesFor("| a |\n|---|\n| 1 |", "inline")).toEqual([]);
    expect(changesFor("**bold**", "inline")).toEqual(["marks"]);
  });
});

describe("scanQuestion", () => {
  it("lists each field that would change, by name", () => {
    const question = normalizeQuestion("q1", {
      text: "Compute x**2 + y**2",
      explanation: "| a |\n|---|\n| 1 |",
      type: "single",
      options: [
        { text: "plain", isCorrect: true, rationale: "because `a`" },
        { text: "_b_", isCorrect: false },
      ],
    });
    expect(scanQuestion(question).map((hit) => [hit.field, hit.changes])).toEqual([
      ["question", ["marks"]],
      ["explanation", ["table"]],
      ["option B", ["marks"]],
      ["reason A", ["marks"]],
    ]);
  });

  it("gives a one-line snippet and nothing for a clean question", () => {
    const [hit] = scanQuestion(normalizeQuestion("q", { text: `**a**\n${"b".repeat(200)}`, options: ["x", "y"] }));
    expect(hit.snippet).toHaveLength(80);
    expect(hit.snippet).not.toContain("\n");
    expect(scanQuestion(normalizeQuestion("q", { text: "Clean?", options: ["x", "y"], correctIndex: 0 }))).toEqual([]);
  });
});

describe("structureOf and firstLine", () => {
  it("lists each structure once, in order", () => {
    const { blocks } = parseRichText("Intro\n\n- a\n- b\n\n| a |\n|---|\n| 1 |\n\n- c\n- d");
    expect(structureOf(blocks)).toEqual(["list", "table"]);
    expect(structureOf(parseRichText("just text").blocks)).toEqual([]);
  });

  it("takes the first non-empty line", () => {
    expect(firstLine("\n  \n  Hello there \nsecond")).toBe("Hello there");
    expect(firstLine("")).toBe("");
  });
});
