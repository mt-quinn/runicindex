import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Bungee, Space_Grotesk, Special_Elite, Caveat } from "next/font/google";
import { RuntimeCrashOverlay } from "@/components/RuntimeCrashOverlay";

const display = Bungee({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
});

const body = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-body",
});

const typewriter = Special_Elite({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-typewriter",
});

const handwriting = Caveat({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-handwriting",
});

export const metadata: Metadata = {
  title: "Runic Index",
  description: "A fantasy-themed LLM-driven stock market",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${typewriter.variable} ${handwriting.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                document.addEventListener('gesturestart', function (e) {
                  e.preventDefault();
                }, { passive: false });
                document.addEventListener('gesturechange', function (e) {
                  e.preventDefault();
                }, { passive: false });
                document.addEventListener('gestureend', function (e) {
                  e.preventDefault();
                }, { passive: false });

                var lastTouchEnd = 0;
                document.addEventListener('touchend', function (e) {
                  var now = Date.now();
                  if (now - lastTouchEnd <= 300) {
                    e.preventDefault();
                  }
                  lastTouchEnd = now;
                }, { passive: false });
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-screen overflow-hidden">
        <div className="fixed inset-0 flex items-stretch justify-center">
          <div className="flex w-full max-w-md mx-auto px-3 py-4 sm:max-w-lg sm:px-4">
            <div className="relative flex-1 rounded-3xl bg-pg-surface/85 shadow-pg-card border border-white/10 overflow-hidden">
              <div className="pointer-events-none absolute inset-0 opacity-30 mix-blend-screen bg-[radial-gradient(circle_at_15%_0%,rgba(255,216,138,0.85)_0,rgba(255,216,138,0)_60%),radial-gradient(circle_at_85%_100%,rgba(121,240,255,0.70)_0,rgba(121,240,255,0)_55%)]" />
              <main className="relative pointer-events-auto h-full w-full flex flex-col">
                {children}
              </main>
              <RuntimeCrashOverlay />
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}


