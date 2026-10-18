import type { Metadata, Viewport } from "next";
import "./globals.css";

// Le clavier du telephone redimensionne la page (Android) au lieu de la
// recouvrir : la zone de saisie reste visible au-dessus. Le zoom manuel reste
// permis (accessibilite) ; le zoom automatique d'iOS est evite en gardant les
// champs a 16 px minimum.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#ffffff",
};

export const metadata: Metadata = {
  title: "XAMXAM — Statistiques officielles du Sénégal",
  description:
    "Assistant conversationnel sur les statistiques officielles du Sénégal.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
