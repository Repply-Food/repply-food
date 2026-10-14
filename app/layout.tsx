import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const generalSans = localFont({
  src: [
    {
      path: "../identidade-visual/fontes/general-sans/GeneralSans-Regular.otf",
      weight: "400",
    },
    {
      path: "../identidade-visual/fontes/general-sans/GeneralSans-Medium.otf",
      weight: "500",
    },
    {
      path: "../identidade-visual/fontes/general-sans/GeneralSans-Semibold.otf",
      weight: "600",
    },
    {
      path: "../identidade-visual/fontes/general-sans/GeneralSans-Bold.otf",
      weight: "700",
    },
  ],
  variable: "--font-local-display",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

const satoshi = localFont({
  src: [
    {
      path: "../identidade-visual/fontes/satoshi/Satoshi-Regular.otf",
      weight: "400",
    },
    {
      path: "../identidade-visual/fontes/satoshi/Satoshi-Medium.otf",
      weight: "500",
    },
    {
      path: "../identidade-visual/fontes/satoshi/Satoshi-Bold.otf",
      weight: "700",
    },
  ],
  variable: "--font-local-sans",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

const jetBrainsMono = localFont({
  src: "../identidade-visual/fontes/jetbrains-mono/JetBrainsMono-VariableFont_wght.ttf",
  weight: "100 800",
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
