"use client";

import { useUi } from "@/lib/i18n";
import { motion } from "motion/react";

export function TypingIndicator() {
  const t = useUi();
  return (
    <div
      className="flex items-center gap-1.5 py-1"
      role="status"
      aria-label={t("searching")}
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-2 w-2 rounded-full bg-gradient-to-br from-brand-400 to-brand-600"
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.85, 1, 0.85] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}
