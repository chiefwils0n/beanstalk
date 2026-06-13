import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { cookies } from "next/headers";
import "./globals.css";
import { THEME_INIT_SCRIPT } from "../lib/theme";
import { authEnabled, SESSION_COOKIE, verifySession } from "../lib/auth";
import { Sidebar } from "../components/Sidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Beanstalk",
  description: "Double-entry accounting for small business",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Show the app shell only when authenticated; otherwise (the /login screen)
  // render the page bare — no sidebar, no business data leaked behind it.
  const authed = !authEnabled() || (await verifySession((await cookies()).get(SESSION_COOKIE)?.value));

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body>
        <Script id="beanstalk-theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        {authed ? (
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="min-w-0 flex-1 p-6 lg:p-8">
              <div className="mx-auto max-w-screen-2xl">{children}</div>
            </main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
