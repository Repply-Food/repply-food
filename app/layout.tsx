import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const generalSans = localFont({
  src: "../identidade-visual/fontes/general-sans/GeneralSans-Regular.otf",
  variable: "--font-local-display",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

const satoshi = localFont({
  src: "../identidade-visual/fontes/satoshi/Satoshi-Regular.otf",
  variable: "--font-local-sans",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

const jetBrainsMono = localFont({
  src: "../identidade-visual/fontes/jetbrains-mono/JetBrainsMono-VariableFont_wght.ttf",
  variable: "--font-local-mono",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

export const metadata: Metadata = {
  title: "repply food.",
  description: "Painel do dono de bar e restaurante",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: {
      url: "/apple-touch-icon.png",
      sizes: "180x180",
      type: "image/png",
    },
  },
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
