import { LIMITS } from "@/lib/quiz-schema";
import { csvHeader } from "@/lib/quiz-format/write";
import { SCENARIO_EXAMPLE } from "@/lib/rich-text/example";
import { toCsvText } from "./table";

// The template files the "AI & formats" page offers for download. Generated into `public/ageno-quiz/` by
// `npm run build:format`, and also read by tests so a template always imports cleanly.

/**
 * A CSV to fill in: the header row, one instruction row and one sample row. Both start with `#`, which the
 * importer skips; delete the `#` in front of the sample to turn it into a real question.
 */
export function csvTemplate(): string {
  const header = csvHeader(6, true).filter((column) => column !== "id");
  const sample: Record<string, string> = {
    level: "#easy",
    type: "single",
    question: "Which protocol encrypts web traffic?",
    option_a: "HTTP",
    option_b: "HTTPS",
    option_c: "FTP",
    correct: "B",
    explanation: "The S stands for secure.",
    a_why: "Sends data in plain text.",
    b_why: "Adds TLS on top of HTTP.",
  };
  const instructions: Record<string, string> = {
    level: "# One row per question. Level: easy, medium or hard (blank = you choose when importing). Type: single or multiple (blank = decided by the correct answers).",
    question: `# Up to ${LIMITS.questionText} characters. A scenario, a table (rows like | a | b |) or a list may go in the question: see the second sample row. Alt+Enter (Excel) or Ctrl+Enter (Sheets) starts a new line in a cell. Options: fill option_a, option_b, ... in order; 2 to ${LIMITS.maxOptions}.`,
    correct: "# The letter (B), the number (2) or the text of the right option; for several: A,C",
    explanation: "# Optional. a_why, b_why, ...: why each option is right or wrong. Delete the # in front of the sample row to use it.",
  };
  const withTable: Record<string, string> = {
    level: "#easy",
    question: SCENARIO_EXAMPLE,
    option_a: "North",
    option_b: "South",
    correct: "A",
    explanation: "North grew by 30; South fell by 10.",
  };
  const row = (values: Record<string, string>) => header.map((column) => values[column] ?? "");
  return "﻿" + toCsvText([header, row(instructions), row(sample), row(withTable)]);
}

/** The plain-text format with every mark used once. */
export const TEXT_TEMPLATE = `# Network basics

## Easy | 20 min | x1

1. Which protocol encrypts web traffic?
   - HTTP
     ~ Sends data in plain text.
   - [x] HTTPS
     ~ Adds TLS on top of HTTP.
   - FTP
   > The S stands for secure.

2. Which of these are private IPv4 address ranges? (Choose all that apply.)
   - [x] 10.0.0.0/8
   - [x] 192.168.0.0/16
   - 8.8.8.0/24
     ~ A public range.

3. A company recorded these sales figures.

   | Region | Q1  | Q2  |
   |:-------|----:|----:|
   | North  | 120 | 150 |
   | South  |  90 |  80 |

   Which region grew in Q2?
   - [x] North
   - South
   > North grew by 30; South fell by 10.

4. A runbook lists these steps. (A line of the question that starts with - or a number and a dot needs a
   backslash in front, so it is not read as an option.)
   \\- Stop the database
   \\- Copy the data files
   \\- Start the database
   Which step should come before the copy?
   - [x] Take a snapshot of the volume
   - Delete the old files

## Hard | 30 min | x1.5

1. What does a TCP three-way handshake end with?
   - SYN
   - SYN-ACK
   - [x] ACK
   ! https://example.com/handshake.png
`;
