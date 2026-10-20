import { ThemeProvider } from "@/components/providers/theme-provider";
import { RegistrarSW } from "@/components/pwa/registrar-sw";
import { Toaster } from "@/components/ui/sonner";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
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
  manifest: "/manifest.webmanifest",
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

export const viewport: Viewport = {
  themeColor: "#ff5a1f",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // A senha de uso único (nonce) da CSP vem do porteiro no cabeçalho do pedido.
  // O next-themes injeta um `<script>` em linha (aplica o tema antes de pintar,
  // para não piscar o tema errado); sem o nonce, a CSP bloquearia esse script.
  // Ler o cabeçalho torna o layout dinâmico — custo esperado da CSP com nonce.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${generalSans.variable} ${satoshi.variable} ${jetBrainsMono.variable}`}
    >
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
          nonce={nonce}
        >
          {children}
          <Toaster />
        </ThemeProvider>
        <RegistrarSW />
      </body>
    </html>
  );
}
