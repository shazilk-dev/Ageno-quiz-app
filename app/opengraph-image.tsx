import { ImageResponse } from "next/og";

export const alt = "Ageno Quiz, part of Agenoverse";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Raw hex: an image render cannot read CSS variables. Values mirror ink, bone, teal and the muted text in app/theme.css.
const INK = "#0e1116";
const BONE = "#f6f5f1";
const TEAL = "#22c3b0";
const MUTED = "#a5a8ae";
const BORDER = "#2d333b";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: INK,
          padding: 72,
          border: `1px solid ${BORDER}`,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 24,
            letterSpacing: 2,
            color: MUTED,
            fontFamily: "monospace",
          }}
        >
          {"// ASSESSMENTS"}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <svg width="150" height="150" viewBox="0 0 32 32" fill="none">
            <path
              d="M6.4 29.2L16 6.4L25.6 29.2"
              stroke={BONE}
              strokeWidth="3.4"
              strokeLinejoin="miter"
              strokeMiterlimit="10"
            />
            <rect x="13" y="19.4" width="6" height="4.5" fill={TEAL} />
          </svg>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: 104,
                fontWeight: 600,
                color: BONE,
                letterSpacing: -3,
                lineHeight: 1,
              }}
            >
              ageno quiz
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 18,
                fontSize: 28,
                color: MUTED,
                fontFamily: "monospace",
              }}
            >
              by agenoverse
            </div>
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 32, color: BONE }}>
          Build with AI. Learn with AI. Rise together.
        </div>
      </div>
    ),
    size
  );
}
