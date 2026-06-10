import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "../components/theme";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body>
        <ThemeProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="min-w-0 flex-1 p-6 lg:p-8">
              <div className="mx-auto max-w-5xl">{children}</div>
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
