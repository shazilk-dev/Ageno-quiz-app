// The generated format files: they match the code they come from, and the standalone validator that goes
// with the AI skill behaves like the app's own checks. Runs `validate.mjs` with Node, as an AI would.
//   npx vitest run __tests__/format-artifacts.test.ts
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { parseQuizJson } from "@/lib/quiz-format/read";
import { checkRows } from "@/lib/quiz-format/checks";
import { allRows } from "@/lib/quiz-format/types";
import { crc32 } from "@/lib/quiz-format/zip";
import { parseSpreadsheetText } from "@/lib/quiz-import/spreadsheet";
import { parseQuizText } from "@/lib/quiz-import/text";

const root = resolve(__dirname, "..");
const skill = join(root, "skills/ageno-quiz-format");
const validator = join(skill, "validate.mjs");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const run = (file: string, ...extra: string[]) => {
  const result = spawnSync(process.execPath, [validator, file, ...extra], { encoding: "utf8" });
  return { code: result.status, out: result.stdout, err: result.stderr };
};

describe("generated files", () => {
  it("are up to date with the code (npm run build:format -- --check)", () => {
    const out = execFileSync(process.execPath, ["--import", "tsx", "scripts/build-format.ts", "--check"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(out).toContain("up to date");
  }, 60_000);

  it("serve the same schema from the app and from the skill", () => {
    expect(read("public/ageno-quiz/schema.json")).toBe(read("skills/ageno-quiz-format/schema.json"));
  });

  it("give the skill a name and description an Agent Skills loader accepts", () => {
    const text = read("skills/ageno-quiz-format/SKILL.md").replace(/\r\n/g, "\n");
    const front = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? "";
    const name = /^name: (.+)$/m.exec(front)?.[1] ?? "";
    const description = /^description: (.+)$/m.exec(front)?.[1] ?? "";
    expect(name).toMatch(/^[a-z0-9-]{1,64}$/);
    // Agent Skills refuse these words in a name.
    expect(name).not.toMatch(/anthropic|claude/);
    expect(description.length).toBeGreaterThan(40);
    expect(description.length).toBeLessThanOrEqual(1024);
    expect(text).toContain("node validate.mjs quiz.ageno.json");
  });

  it("offer the skill as a zip with the folder at the top, ready for claude.ai", () => {
    const zip = readFileSync(join(root, "public/ageno-quiz/ageno-quiz-format.zip"));
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    // End of central directory record: the last 22 bytes (no comment).
    expect(view.getUint32(zip.length - 22, true)).toBe(0x06054b50);
    const count = view.getUint16(zip.length - 12, true);
    let at = view.getUint32(zip.length - 6, true);
    const found: Record<string, number> = {};
    for (let i = 0; i < count; i++) {
      expect(view.getUint32(at, true)).toBe(0x02014b50);
      const crc = view.getUint32(at + 16, true);
      const size = view.getUint32(at + 24, true);
      const nameLength = view.getUint16(at + 28, true);
      const offset = view.getUint32(at + 42, true);
      const name = zip.subarray(at + 46, at + 46 + nameLength).toString("utf8");
      // The data sits after its local header, and its checksum matches.
      const start = offset + 30 + view.getUint16(offset + 26, true);
      expect(crc32(zip.subarray(start, start + size)), name).toBe(crc);
      found[name] = size;
      at += 46 + nameLength;
    }
    expect(Object.keys(found).sort()).toEqual(
      [
        "ageno-quiz-format/SKILL.md",
        "ageno-quiz-format/examples/full.ageno.json",
        "ageno-quiz-format/examples/minimal.ageno.json",
        "ageno-quiz-format/examples/template.csv",
        "ageno-quiz-format/examples/template.txt",
        "ageno-quiz-format/schema.json",
        "ageno-quiz-format/validate.mjs",
      ].sort()
    );
  });

  it("hold examples that pass the schema and the validator", () => {
    const validate = new Ajv2020({ allErrors: true }).compile(JSON.parse(read("public/ageno-quiz/schema.json")));
    for (const file of ["minimal.ageno.json", "full.ageno.json"]) {
      const path = join(skill, "examples", file);
      expect(validate(JSON.parse(readFileSync(path, "utf8"))), file).toBe(true);
      expect(run(path).code, file).toBe(0);
    }
  });

  it("hold templates the importers read", () => {
    const text = parseQuizText(read("public/ageno-quiz/template.txt"));
    expect(text.issues).toEqual([]);
    expect(checkRows(allRows(text)).every((row) => row.status === "ok")).toBe(true);
    // The CSV template is all comments until someone removes the # from its sample row.
    const csv = parseSpreadsheetText(read("public/ageno-quiz/template.csv").replace("#easy", "easy"));
    expect(csv.issues).toEqual([]);
    expect(checkRows(allRows(csv)).every((row) => row.status === "ok")).toBe(true);
    expect(parseQuizJson(read("public/ageno-quiz/example.ageno.json")).issues).toEqual([]);
  });
});

describe("validate.mjs", () => {
  const dir = mkdtempSync(join(tmpdir(), "ageno-validate-"));
  const write = (name: string, content: string) => {
    const path = join(dir, name);
    writeFileSync(path, content);
    return path;
  };
  const quiz = (questions: unknown[]) => JSON.stringify({ format: "ageno-quiz", version: 1, levels: { easy: { questions } } });
  const good = { text: "Q", options: [{ text: "A", isCorrect: true }, { text: "B", isCorrect: false }] };

  it("exits 0 and says the file is ready", () => {
    const result = run(write("ok.json", quiz([good])));
    expect(result.code).toBe(0);
    expect(result.out).toContain("Ready to import. 1 question: all ready");
  });

  it("exits 1 and lists each problem with its place", () => {
    const result = run(write("bad.json", quiz([good, { text: "", options: [{ text: "A", isCorrect: false }, { text: "B", isCorrect: false }] }, "nonsense"])));
    expect(result.code).toBe(1);
    expect(result.out).toContain("ERROR    Easy · question 2: write the question.");
    expect(result.out).toContain("ERROR    Easy · question 2: pick the correct answer.");
    expect(result.out).toContain("ERROR    Easy · question 3: this is not a question");
    expect(result.out).toContain("Not ready. 3 questions: 1 ready, 2 need fixing");
  });

  it("refuses a file that isn't JSON, a newer version, and a missing file", () => {
    expect(run(write("broken.json", "{ nope")).out).toMatch(/isn't valid JSON/);
    expect(run(write("v2.json", JSON.stringify({ format: "ageno-quiz", version: 2, levels: {} }))).code).toBe(1);
    expect(run(join(dir, "missing.json")).code).toBe(2);
    expect(spawnSync(process.execPath, [validator], { encoding: "utf8" }).status).toBe(2);
  });

  it("prints a JSON report with --json", () => {
    const result = run(write("report.json", quiz([good])), "--json");
    expect(JSON.parse(result.out)).toMatchObject({ ok: true, shape: "quiz", counts: { easy: 1 }, errors: [] });
  });

  it("accepts a table and warns about a broken one, without refusing the file", () => {
    const table = { ...good, text: "Scenario.\n\n| a | b |\n|---|---:|\n| 1 | 2 |\n\nWhich?" };
    expect(run(write("table.json", quiz([table]))).out).toContain("Ready to import. 1 question: all ready");
    const broken = { ...good, text: "| a | b |\n|---|---|\n| 1 | 2 | 3 |" };
    const result = run(write("broken-table.json", quiz([broken])));
    expect(result.code).toBe(0);
    expect(result.out).toMatch(/Easy · question 1: Question text, line 3: Row 2 has 3 cells but the header has 2/);
  });

  it("agrees with the app's own validator on the same file", async () => {
    const { validateQuizFile } = await import("@/lib/quiz-format/validate");
    const text = quiz([good, { ...good, type: "single", options: [{ text: "A", isCorrect: true }, { text: "B", isCorrect: true }] }]);
    const report = JSON.parse(run(write("same.json", text), "--json").out);
    expect(report).toEqual(validateQuizFile(text));
  });
});
