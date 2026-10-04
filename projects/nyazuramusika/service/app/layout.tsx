import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NyazuraMusika | Local marketplace",
  description: "The local Android marketplace for buying and selling goods around Nyazura.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
