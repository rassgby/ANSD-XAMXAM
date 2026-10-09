export default function QuestionHeading({ question }: { question: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: "var(--c-gray)",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        Votre question
      </span>
      <span style={{ fontSize: 21, fontWeight: 500, color: "var(--c-primary-deep)" }}>
        {question}
      </span>
    </div>
  );
}
