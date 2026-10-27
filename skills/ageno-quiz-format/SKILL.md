---
name: ageno-quiz-format
description: Turns a set of quiz questions (from a document, spreadsheet, past paper, notes or a photo of them) into a validated Ageno Quiz file, quiz.ageno.json, ready to import into Ageno Quiz. Use whenever someone wants to convert, format or write questions for Ageno Quiz, or mentions quiz.ageno.json or the Ageno Quiz format.
---

# Ageno Quiz format

Convert the user's questions into one JSON file that Ageno Quiz can import (Quizzes > Import), and check it before handing it over.

Files in this folder: `schema.json` (JSON Schema of the format), `validate.mjs` (checks a file with the same rules the app uses; needs Node 18 or newer and nothing else), `examples/` (a minimal and a full file, and a CSV and text template for people who prefer a spreadsheet).

## Rules

1. **Ask only for what is missing.** If the source doesn't say which difficulty level the questions belong to (easy, medium or hard), how many minutes people get, or whether to add a reason for each answer option, ask in one short message. Never ask for something the source already tells you.
2. **Never invent a correct answer.** Use the answer the source gives. If the source gives none and you have to work it out, still mark it, and put a short `note` on that question saying it is your inference ("Answer inferred, please check."). Tell the user how many questions have a note.
3. **Use `"type": "multiple"` only when the source says more than one answer is right** (select all that apply, choose two, ...). Everything else is `"single"` with exactly one option marked `isCorrect`. You may leave `type` out: it is then decided by how many options are correct.
4. **Options:** 3 to 5 unless the source has more (2 to 10 are allowed). Don't pad with silly choices to reach a number. Don't write "all of the above" or "none of the above". Keep the source's own order; if you write the options yourself, vary which position is correct.
5. **Reasons are optional.** Add `rationale` (why one option is right or wrong, up to 1000 characters) and `explanation` (a note on the whole question, up to 2000 characters) when the user asks for them or the source provides them. Never make up facts to fill them in.
6. **Stay inside the limits:** question text up to 2000 characters, an option up to 1000, at most 400 questions per level, and about 300 KB of text per level. If there is more, split it into several files (for example one per level).
7. **Plain text only** in every string: no HTML and no Markdown. Keep the user's wording, fix only obvious typos. `imageUrl` must be a full https:// link the source gave you; never invent one.
8. **Check before you hand it over.** Save the JSON as `quiz.ageno.json`, run `node validate.mjs quiz.ageno.json`, fix every error it reports and run it again until it says the file is ready. If you cannot run code, check the file against schema.json yourself and say that you could not run the validator. Warnings don't block an import; mention any that matter.
9. **Hand over the file itself** (no commentary inside it), then say in a few lines: how many questions per level, how many have a note, and anything you couldn't convert.

## The format

The file is JSON, "Ageno Quiz Format" version 1:

- `format` is `"ageno-quiz"` and `version` is `1`.
- `quiz` (optional): `title`, `description`, `duration` (default minutes), `examMode` (`practice` or `strict`), `showAnswerReview` (true or false).
- `levels` (required): `easy`, `medium` and/or `hard`. Each has `questions`, and optionally `duration` (minutes for that level) and `pointsMultiplier` (1 to 5).
- A question has `text` and `options` (each `{ "text", "isCorrect", "rationale"? }`), and optionally `type`, `explanation`, `imageUrl` and `note`. `note` is a message to the person importing: it is shown in the import preview and never saved.
- Leave `id` out. Only a file exported from the app has ids, and an id means "update this existing question".

Smallest valid file:

```json
{
  "format": "ageno-quiz",
  "version": 1,
  "levels": {
    "easy": {
      "questions": [
        {
          "text": "Which protocol encrypts web traffic?",
          "options": [
            {
              "text": "HTTP",
              "isCorrect": false
            },
            {
              "text": "HTTPS",
              "isCorrect": true
            },
            {
              "text": "FTP",
              "isCorrect": false
            }
          ]
        }
      ]
    }
  }
}
```

A fuller one (settings, two levels, a select-all question, reasons, an explanation and a note):

```json
{
  "format": "ageno-quiz",
  "version": 1,
  "quiz": {
    "title": "Network basics",
    "description": "Protocols, ports and addressing.",
    "duration": 20,
    "examMode": "practice",
    "showAnswerReview": true
  },
  "levels": {
    "easy": {
      "duration": 15,
      "pointsMultiplier": 1,
      "questions": [
        {
          "type": "single",
          "text": "Which protocol encrypts web traffic?",
          "options": [
            {
              "text": "HTTP",
              "isCorrect": false,
              "rationale": "Sends data in plain text."
            },
            {
              "text": "HTTPS",
              "isCorrect": true,
              "rationale": "Adds TLS on top of HTTP."
            },
            {
              "text": "FTP",
              "isCorrect": false
            }
          ],
          "explanation": "The S stands for secure."
        },
        {
          "type": "multiple",
          "text": "Which of these are private IPv4 address ranges?",
          "options": [
            {
              "text": "10.0.0.0/8",
              "isCorrect": true
            },
            {
              "text": "172.16.0.0/12",
              "isCorrect": true
            },
            {
              "text": "8.8.8.0/24",
              "isCorrect": false,
              "rationale": "A public range."
            },
            {
              "text": "192.168.0.0/16",
              "isCorrect": true
            }
          ],
          "note": "The source listed only two ranges; I added the third from RFC 1918. Please check."
        }
      ]
    },
    "hard": {
      "duration": 25,
      "pointsMultiplier": 1.5,
      "questions": [
        {
          "text": "What does a TCP three-way handshake end with?",
          "options": [
            {
              "text": "SYN",
              "isCorrect": false
            },
            {
              "text": "SYN-ACK",
              "isCorrect": false
            },
            {
              "text": "ACK",
              "isCorrect": true
            },
            {
              "text": "FIN",
              "isCorrect": false
            }
          ],
          "imageUrl": "https://example.com/handshake.png"
        }
      ]
    }
  }
}
```

## Checking

```
node validate.mjs quiz.ageno.json
```

It prints each problem with its place (for example `Easy · question 3: pick the correct answer.`) and ends with a line such as `46 questions: 44 ready, 2 need fixing`. Exit code 0 means the file can be imported; 1 means it has errors; add `--json` for a machine-readable report.
