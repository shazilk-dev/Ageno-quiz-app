import { FORMAT_NAME, FORMAT_VERSION } from "./types";

// The example files shipped with the format (and with the AI skill). They are data here so a test can hold
// them to the schema and the validator, and `npm run build:format` writes them out.

/** The smallest file that works: one level, one question, no settings. */
export const MINIMAL_EXAMPLE = {
  format: FORMAT_NAME,
  version: FORMAT_VERSION,
  levels: {
    easy: {
      questions: [
        {
          text: "Which protocol encrypts web traffic?",
          options: [
            { text: "HTTP", isCorrect: false },
            { text: "HTTPS", isCorrect: true },
            { text: "FTP", isCorrect: false },
          ],
        },
      ],
    },
  },
};

/** Settings, two levels, a select-all question, reasons, an explanation and a note for the reviewer. */
export const FULL_EXAMPLE = {
  format: FORMAT_NAME,
  version: FORMAT_VERSION,
  quiz: {
    title: "Network basics",
    description: "Protocols, ports and addressing.",
    duration: 20,
    examMode: "practice",
    showAnswerReview: true,
  },
  levels: {
    easy: {
      duration: 15,
      pointsMultiplier: 1,
      questions: [
        {
          type: "single",
          text: "Which protocol encrypts web traffic?",
          options: [
            { text: "HTTP", isCorrect: false, rationale: "Sends data in plain text." },
            { text: "HTTPS", isCorrect: true, rationale: "Adds TLS on top of HTTP." },
            { text: "FTP", isCorrect: false },
          ],
          explanation: "The S stands for secure.",
        },
        {
          type: "multiple",
          text: "Which of these are private IPv4 address ranges?",
          options: [
            { text: "10.0.0.0/8", isCorrect: true },
            { text: "172.16.0.0/12", isCorrect: true },
            { text: "8.8.8.0/24", isCorrect: false, rationale: "A public range." },
            { text: "192.168.0.0/16", isCorrect: true },
          ],
          note: "The source listed only two ranges; I added the third from RFC 1918. Please check.",
        },
      ],
    },
    hard: {
      duration: 25,
      pointsMultiplier: 1.5,
      questions: [
        {
          text: "What does a TCP three-way handshake end with?",
          options: [
            { text: "SYN", isCorrect: false },
            { text: "SYN-ACK", isCorrect: false },
            { text: "ACK", isCorrect: true },
            { text: "FIN", isCorrect: false },
          ],
          imageUrl: "https://example.com/handshake.png",
        },
      ],
    },
  },
};
