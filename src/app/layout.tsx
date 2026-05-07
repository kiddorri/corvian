import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Corvian — AI-тьютор",
  description: "Два ворона. Один результат.",
};

const fontVars = {
  "--font-dm-sans": "'DM Sans'",
  "--font-space-mono": "'Space Mono'",
} as React.CSSProperties;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" style={fontVars}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Space+Mono:wght@400;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
