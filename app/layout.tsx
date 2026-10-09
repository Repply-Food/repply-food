import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const generalSans = localFont({
  src: "../identidade-visual/fontes/general-sans/GeneralSans-Regular.otf",
  variable: "--font-display",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

const satoshi = localFont({
  src: "../identidade-visual/fontes/satoshi/Satoshi-Regular.otf",
  variable: "--font-sans",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

const jetBrainsMono = localFont({
  src: "../identidade-visual/fontes/jetbrains-mono/JetBrainsMono-VariableFont_wght.ttf",
  variable: "--font-mono",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

export const metadata: Metadata = {
  title: "repply food.",
  description: "Painel do dono de bar e restaurante",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="pt-BR"
      className={`${generalSans.variable} ${satoshi.variable} ${jetBrainsMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
