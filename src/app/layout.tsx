import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Enworia — ESG Management Tool",
  description: "Tool interno per gestione clienti ESG e report VSME Basic",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body className="antialiased min-h-screen">
        <header className="border-b border-[var(--border)] bg-white">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/" className="text-xl font-bold tracking-tight text-[var(--primary)]">
              Enworia
            </Link>
            <nav className="flex gap-6 text-sm">
              <Link
                href="/clients"
                className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
              >
                Clienti
              </Link>
            </nav>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
