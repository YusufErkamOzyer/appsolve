import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const plexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-plex-mono",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "APPSOLVE.OS1 // SRE Command Workstation",
  description: "Autonomous AI Incident Management & Telemetry Command Center for QuickCart",
  icons: {
    icon: "/appsolve-icon.png",
    shortcut: "/appsolve-icon.png",
    apple: "/appsolve-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className={`${plexMono.variable} ${spaceGrotesk.variable} h-full`}>
      <body className="min-h-full os-desk-grid antialiased font-sans text-[13px] leading-relaxed selection:bg-[#F2A67B] selection:text-[#522D60]">
        {children}
      </body>
    </html>
  );
}
