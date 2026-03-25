import type { Metadata } from "next";
import { DM_Sans, DM_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-dm-sans",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
});

export const metadata: Metadata = {
  title: "Enworia",
  description: "Carbon Management SaaS",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className={`${dmSans.variable} ${dmMono.variable}`}>
      <body className="antialiased min-h-screen">
        {/* ── Navbar ── */}
        <nav
          style={{
            background: "#1C2B28",
            padding: "0 28px",
            height: 56,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "sticky",
            top: 0,
            zIndex: 50,
          }}
        >
          <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center" }}>
            <svg width="148" height="32" viewBox="0 0 172 38" fill="none">
              <line x1="0" y1="7" x2="17" y2="7" stroke="#4A6A5E" strokeWidth="2" strokeLinecap="round" />
              <line x1="0" y1="19" x2="17" y2="19" stroke="#4A6A5E" strokeWidth="2.8" strokeLinecap="round" opacity=".85" />
              <line x1="0" y1="31" x2="17" y2="31" stroke="#4A6A5E" strokeWidth="2" strokeLinecap="round" />
              <path d="M17 7 L24 19 L17 31" fill="none" stroke="#27AE60" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="30" cy="19" r="5.5" fill="#27AE60" />
              <text x="42" y="18" fontFamily="'DM Sans',sans-serif" fontSize="22" fill="#fff" letterSpacing="-0.4" dominantBaseline="central">
                <tspan fontWeight="500" opacity=".75">enwor</tspan>
                <tspan fontWeight="700">ia</tspan>
              </text>
            </svg>
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <Link
              href="/clients"
              className="hover:text-white transition-colors"
              style={{ color: "#A8C5BE", fontSize: 14, fontWeight: 500, textDecoration: "none" }}
            >
              Clienti
            </Link>
            <div
              style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "#2A3D39", border: "1px solid #3A5249",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 600, color: "#6FCF97", cursor: "pointer",
              }}
            >
              CM
            </div>
          </div>
        </nav>

        <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
