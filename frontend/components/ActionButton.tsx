export default function ActionButton({
  icon,
  label,
  tone = "outline",
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  tone?: "outline" | "solid";
  onClick?: () => void;
}) {
  const solid = tone === "solid";
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 40,
        display: "flex",
        alignItems: "center",
        gap: 8,
        border: solid ? "none" : "1px solid var(--c-border)",
        background: solid ? "var(--c-primary)" : "#FFFFFF",
        borderRadius: "var(--radius-sm)",
        padding: "0 14px",
      }}
    >
      {icon}
      <span
        style={{
          fontSize: 13,
          fontWeight: solid ? 600 : 400,
          color: solid ? "#FFFFFF" : "var(--c-ink)",
        }}
      >
        {label}
      </span>
    </button>
  );
}
