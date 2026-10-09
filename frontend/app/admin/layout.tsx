import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tableau de bord — Assistant de l'ANSD",
  description: "Indicateurs d'utilisation de l'assistant (accès administrateur).",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
