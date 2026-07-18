import type { Metadata, Viewport } from "next";
import { Outfit, Fira_Code } from "next/font/google";
import Script from "next/script";
import Navbar from "../components/Navbar";
import { ToastProvider } from "../components/Toast";
import { ConfirmProvider } from "../components/ConfirmDialog";
import "./design-system.css";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const firaCode = Fira_Code({
  variable: "--font-fira-code",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#131219", // Deep Obsidian base color
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "ShuttleSync - Badminton Tournament Tracker",
  description: "Manage badminton matches, random doubles pairings, and real-time live tournament scoreboards.",
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${outfit.variable} ${firaCode.variable} h-full antialiased`}
    >
      <head />
      <body className="min-h-full">
        <Script id="theme-loader" strategy="beforeInteractive">
          {`
            (function() {
              document.documentElement.setAttribute('data-theme', 'dark');
            })()
          `}
        </Script>
        <ToastProvider>
          <ConfirmProvider>
            <div className="app-layout">
              <Navbar />
              <main className="main-content">
                {children}
              </main>
            </div>
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}

