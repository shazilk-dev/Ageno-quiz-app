"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, Button, SegmentedControl, Textarea } from "@/components/ui";
import type { ParsedImport } from "@/lib/quiz-format/types";
import { MAX_IMPORT_BYTES } from "@/lib/quiz-format/types";
import { readImport, routeForFile, type ImportRoute } from "@/lib/quiz-import";

type Choice = ImportRoute | "auto";

const HINTS: Record<Choice, string> = {
  auto: "Paste or choose a file and it is recognised: JSON, rows copied from a spreadsheet (or a CSV file), or the plain-text format.",
  json: "A file an AI made with the Ageno Quiz skill, or one you exported from here. It can hold a whole quiz or just some questions.",
  sheet: "Copy the rows in Excel or Google Sheets, header row included, and paste them here. Or choose a CSV file.",
  text: "Type questions by hand: a number and a dot starts a question, \"- \" an option, \"[x]\" marks a correct one.",
};

interface SourceStepProps {
  /** Called with what was read, and the text it was read from. */
  onRead: (parsed: ParsedImport, text: string, route: ImportRoute) => void;
  /** Where the "AI & formats" help lives; left out when the page is shown inside a dialog. */
  showHelpLink?: boolean;
}

/** Step 1: get the text in, by pasting or by choosing a file. */
export function SourceStep({ onRead, showHelpLink = true }: SourceStepProps) {
  const [choice, setChoice] = useState<Choice>("auto");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setError(`That file is larger than ${MAX_IMPORT_BYTES / 1_000_000} MB. Split the quiz into several files.`);
      return;
    }
    try {
      setText(await file.text());
      setError(null);
      const suggested = routeForFile(file.name);
      if (suggested) setChoice(suggested);
    } catch {
      setError("We couldn't read that file.");
    }
  };

  const read = () => {
    const { parsed, route } = readImport(text, choice);
    onRead(parsed, text, route);
  };

  return (
    <div className="space-y-5">
      <SegmentedControl<Choice>
        label="What are you importing?"
        value={choice}
        onChange={setChoice}
        options={[
          { value: "auto", label: "Detect" },
          { value: "json", label: "JSON" },
          { value: "sheet", label: "Sheet / CSV" },
          { value: "text", label: "Text" },
        ]}
      />
      <p className="max-w-[65ch] text-sm text-text-muted">{HINTS[choice]}</p>

      <Textarea
        label="Paste here"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setError(null);
        }}
        className="min-h-56 font-mono text-sm"
        spellCheck={false}
        placeholder={choice === "json" ? '{ "format": "ageno-quiz", "version": 1, "levels": { ... } }' : undefined}
      />

      <div>
        <label htmlFor="import-file" className="mb-2 block text-sm font-medium">
          Or choose a file
        </label>
        <input
          id="import-file"
          type="file"
          accept=".json,.csv,.tsv,.txt,.md,application/json,text/csv,text/plain"
          onChange={(event) => {
            void loadFile(event.target.files?.[0]);
            event.target.value = "";
          }}
          className="block w-full text-sm text-text-muted file:mr-3 file:h-11 file:cursor-pointer file:rounded-md file:border file:border-border file:bg-surface file:px-4 file:text-text"
        />
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={read} disabled={!text.trim()}>
          Check the questions
        </Button>
        {showHelpLink && (
          <Link href="/quizzes/ai" className="text-sm text-link underline-offset-4 hover:underline">
            Using an AI? Get the instructions and templates
          </Link>
        )}
      </div>
    </div>
  );
}
