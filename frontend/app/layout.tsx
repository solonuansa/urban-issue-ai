import type { Metadata } from "next";
import { Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import TopAuthActions from "@/components/TopAuthActions";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "CivicAI - Urban Issue Reporting",
  description: "Report potholes and garbage with AI-assisted prioritization.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${manrope.variable} ${jetbrainsMono.variable} app-shell antialiased`}
        style={{ fontFamily: "var(--font-manrope)" }}
      >
        <div className="min-h-screen md:pl-72">
          <Sidebar />
          <main className="min-w-0 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
            <TopAuthActions />
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
