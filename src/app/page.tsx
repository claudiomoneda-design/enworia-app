import Link from "next/link";

export default function Home() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-3xl font-bold text-[var(--primary)] mb-3">
        Enworia
      </h1>
      <p className="text-[var(--muted)] mb-8 max-w-md mx-auto">
        Tool interno per la gestione dei clienti ESG e la generazione di report VSME Basic.
      </p>
      <Link
        href="/clients"
        className="inline-block bg-[var(--accent)] text-white px-6 py-2.5 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
      >
        Vai ai clienti
      </Link>
    </div>
  );
}
