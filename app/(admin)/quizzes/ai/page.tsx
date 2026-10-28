import { Download, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminPage } from "@/components/admin/AdminPage";
import { Button, Card, CopyButton } from "@/components/ui";
import { pasteInstructions, SKILL_NAME } from "@/lib/quiz-format/instructions";
import { buildJsonSchema } from "@/lib/quiz-format/json-schema";
import { LIMITS } from "@/lib/quiz-schema";

export const metadata: Metadata = { title: "AI & formats" };

const FILES = [
  { href: "/ageno-quiz/example.ageno.json", label: "Example quiz (JSON)", note: "Two levels, a select-all question, reasons, a table, a list and a note." },
  { href: "/ageno-quiz/schema.json", label: "JSON Schema", note: "For tools that check JSON against a schema." },
  { href: "/ageno-quiz/template.csv", label: "Spreadsheet template (CSV)", note: "Opens in Excel or Google Sheets." },
  { href: "/ageno-quiz/template.txt", label: "Plain-text template", note: "For typing questions by hand." },
];

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[2rem_1fr] gap-3">
      <span className="font-mono text-text-muted">{n}.</span>
      <div>
        <h3 className="font-medium">{title}</h3>
        <div className="mt-1 max-w-[65ch] text-text-muted">{children}</div>
      </div>
    </li>
  );
}

/** How to bring a quiz in from an AI, and the files that go with it. Static: nothing on it is per person. */
export default function AiFormatsPage() {
  const instructions = pasteInstructions(JSON.stringify(buildJsonSchema(), null, 2));

  return (
    <AdminPage
      title="AI & formats"
      description="The fastest way to a quiz: give an AI your questions and let it write the file. Or fill in a spreadsheet."
      width="narrow"
      back={{ href: "/quizzes", label: "All quizzes" }}
      actions={
        <Button asChild>
          <Link href="/quizzes/import">
            <Upload className="size-4" aria-hidden="true" />
            Import
          </Link>
        </Button>
      }
    >
      <ol className="space-y-5">
        <Step n={1} title="Give your AI the instructions">
          Install the skill below, or paste the instructions into any AI chat. They tell it the file format, the limits
          and the rules that keep answers honest: it must not invent a correct answer, and flags the ones it had to guess.
        </Step>
        <Step n={2} title="Hand it your questions">
          A document, a past paper, notes or a photo. It writes <span className="font-mono">quiz.ageno.json</span>. With
          the skill and a tool that can run code it also checks the file before giving it to you.
        </Step>
        <Step n={3} title="Import it">
          <Link href="/quizzes/import" className="text-link underline-offset-4 hover:underline">
            Import
          </Link>{" "}
          shows every question with a status, highlights anything the AI marked as a guess, lets you fix or skip a row,
          and tells you exactly what will change before it saves anything. Nothing goes live until you open the quiz.
          A question can hold a scenario, a table, a list or a code block: the AI writes them in the file, and the
          check step shows each one the way players will see it.
        </Step>
      </ol>

      <section aria-labelledby="skill-heading" className="mt-12">
        <h2 id="skill-heading" className="text-xl">
          The skill
        </h2>
        <p className="mt-2 max-w-[65ch] text-text-muted">
          A folder (<span className="font-mono">{SKILL_NAME}</span>) with the instructions, the schema, a checker that
          runs on plain Node 18 or newer, and examples. The checker uses the same rules as the Import page.
        </p>
        <div className="mt-4">
          <Button asChild variant="secondary">
            <a href={`/ageno-quiz/${SKILL_NAME}.zip`} download>
              <Download className="size-4" aria-hidden="true" />
              Download the skill (zip)
            </a>
          </Button>
        </div>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <Card className="p-4">
            <dt className="font-medium">In claude.ai</dt>
            <dd className="mt-1 text-sm text-text-muted">
              Settings, Features, upload the zip. Needs code execution switched on; custom skills belong to the person who
              uploaded them.
            </dd>
          </Card>
          <Card className="p-4">
            <dt className="font-medium">In Claude Code</dt>
            <dd className="mt-1 text-sm text-text-muted">
              Unzip the folder into <span className="font-mono">~/.claude/skills/</span> (for you) or{" "}
              <span className="font-mono">.claude/skills/</span> (for a project).
            </dd>
          </Card>
        </dl>
      </section>

      <section aria-labelledby="paste-heading" className="mt-12">
        <h2 id="paste-heading" className="text-xl">
          No install: paste the instructions
        </h2>
        <p className="mt-2 max-w-[65ch] text-text-muted">
          For any AI chat. It contains the same rules and the JSON Schema. The AI can&apos;t run the checker then, so the
          Import page does the checking.
        </p>
        <div className="mt-3">
          <CopyButton text={instructions} label="Copy AI instructions" className="border border-border" />
        </div>
        <details className="mt-4 rounded-lg border border-border bg-surface">
          <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm text-text-muted">Read them first</summary>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap border-t border-border p-4 font-mono text-xs">
            {instructions}
          </pre>
        </details>
      </section>

      <section aria-labelledby="files-heading" className="mt-12">
        <h2 id="files-heading" className="text-xl">
          Files
        </h2>
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-surface">
          {FILES.map((file) => (
            <li key={file.href} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">{file.label}</p>
                <p className="text-sm text-text-muted">{file.note}</p>
              </div>
              <Button asChild variant="ghost" size="sm">
                <a href={file.href} download>
                  <Download className="size-4" aria-hidden="true" />
                  Download
                </a>
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="limits-heading" className="mt-12">
        <h2 id="limits-heading" className="text-xl">
          The rules in short
        </h2>
        <ul className="mt-3 max-w-[65ch] list-disc space-y-1 pl-5 text-text-muted">
          <li>A level holds up to {LIMITS.maxQuestionsPerLevel} questions and about {Math.round(LIMITS.maxLevelBytes / 1000)} KB of text.</li>
          <li>A question has {LIMITS.minOptions} to {LIMITS.maxOptions} options, each up to {LIMITS.optionText} characters.</li>
          <li>One correct option makes a question single-answer; several make it select-all, and the player must pick them all.</li>
          <li>A reason for an option is up to {LIMITS.rationale} characters; the explanation for the question up to {LIMITS.explanation}.</li>
          <li>
            The text of a question (and the explanation) may hold paragraphs, <span className="font-mono">**bold**</span>,
            lists, code blocks and tables written as <span className="font-mono">| a | b |</span> rows with a{" "}
            <span className="font-mono">|---|---|</span> line under the header. Options stay one line. HTML, links and images
            are not allowed; <span className="font-mono">&lt;br&gt;</span> is turned into a line break on import.
          </li>
          <li>
            In a spreadsheet, one row is one question. Columns: level, type, question, option_a to option_f, correct (B, 2, the
            option&apos;s text, or A,C), explanation, a_why to f_why, image. A row starting with # is skipped.
          </li>
          <li>
            In plain text, a number and a dot start a question, &quot;- &quot; an option, &quot;[x]&quot; a correct one, &quot;~&quot; the
            reason for the option above, &quot;&gt;&quot; the explanation, &quot;!&quot; an image. A question or explanation can
            go over several lines: a blank line starts a new paragraph, table rows keep their lines, and a line that would
            be read as an option (starting with &quot;-&quot; or a number and a dot) takes a backslash in front.
          </li>
        </ul>
      </section>
    </AdminPage>
  );
}
