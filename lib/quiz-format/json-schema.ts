import { EXAM_MODES, LEVELS, LIMITS } from "@/lib/quiz-schema";
import { QUESTION_TYPES } from "@/lib/exam/normalize";
import { FORMAT_NAME, FORMAT_VERSION } from "./types";

// The JSON Schema of Ageno Quiz Format v1, built from the same constants the validation uses (`LIMITS`,
// `LEVELS`, ...) so it cannot drift from them. `npm run build:format` writes it to
// `public/ageno-quiz/schema.json`.
//
// The schema describes the whole-quiz envelope an AI should write. It is stricter than the app, which also
// reads bare lists, older exports and unknown fields (with a warning). What a schema cannot say is left to
// `validate.mjs` and the importer: the text-size cap per level, an image link that really parses, and
// duplicate question ids.

const notBlank = "\\S";

const text = (maxLength: number) => ({ type: "string", pattern: notBlank, maxLength });

export function buildJsonSchema() {
  const correctOption = {
    type: "object",
    properties: { isCorrect: { const: true } },
    required: ["isCorrect"],
  };

  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: `Ageno Quiz Format v${FORMAT_VERSION}`,
    description:
      "A quiz for Ageno Quiz: settings, and questions grouped by difficulty level. Import it from Quizzes > Import.",
    type: "object",
    required: ["format", "version", "levels"],
    additionalProperties: false,
    properties: {
      format: { const: FORMAT_NAME },
      version: { const: FORMAT_VERSION },
      quiz: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: text(LIMITS.title),
          description: { type: "string", maxLength: LIMITS.description },
          duration: {
            description: "Default time limit in minutes; a level can set its own.",
            type: "integer",
            minimum: LIMITS.minMinutes,
            maximum: LIMITS.maxMinutes,
          },
          examMode: { enum: [...EXAM_MODES] },
          showAnswerReview: { type: "boolean" },
        },
      },
      levels: {
        type: "object",
        minProperties: 1,
        additionalProperties: false,
        properties: Object.fromEntries(LEVELS.map((level) => [level, { $ref: "#/$defs/level" }])),
      },
    },
    $defs: {
      level: {
        type: "object",
        required: ["questions"],
        additionalProperties: false,
        properties: {
          duration: {
            description: "Minutes for this level.",
            type: "integer",
            minimum: LIMITS.minMinutes,
            maximum: LIMITS.maxMinutes,
          },
          pointsMultiplier: {
            description: "The score is the percent correct times this, capped at 100.",
            type: "number",
            minimum: LIMITS.minMultiplier,
            maximum: LIMITS.maxMultiplier,
          },
          questions: {
            type: "array",
            maxItems: LIMITS.maxQuestionsPerLevel,
            items: { $ref: "#/$defs/question" },
          },
        },
      },
      question: {
        type: "object",
        required: ["text", "options"],
        additionalProperties: false,
        properties: {
          id: {
            description: "Only in an export. Present means: update this question; absent means: a new question.",
            type: "string",
            pattern: "^[A-Za-z0-9_-]{1,128}$",
          },
          type: {
            description:
              "single: exactly one correct option. multiple: one or more, and the player must pick all of them. Leave out and it follows the number of correct options.",
            enum: [...QUESTION_TYPES],
          },
          text: text(LIMITS.questionText),
          options: {
            type: "array",
            minItems: LIMITS.minOptions,
            maxItems: LIMITS.maxOptions,
            items: { $ref: "#/$defs/option" },
          },
          explanation: { type: "string", maxLength: LIMITS.explanation },
          imageUrl: { type: "string", maxLength: LIMITS.imageUrl, pattern: "^https://\\S+$" },
          note: {
            description: "A remark for the person importing (for example, that the answer was guessed). Shown in the preview, never saved.",
            type: "string",
          },
        },
        allOf: [
          // At least one correct option, whatever the type.
          { properties: { options: { type: "array", contains: correctOption, minContains: 1 } } },
          // A single-answer question has exactly one.
          {
            if: { properties: { type: { const: "single" } }, required: ["type"] },
            then: { properties: { options: { type: "array", contains: correctOption, maxContains: 1 } } },
          },
        ],
      },
      option: {
        type: "object",
        required: ["text", "isCorrect"],
        additionalProperties: false,
        properties: {
          text: text(LIMITS.optionText),
          isCorrect: { type: "boolean" },
          rationale: { description: "Why this option is right or wrong.", type: "string", maxLength: LIMITS.rationale },
        },
      },
    },
  };
}
