"use client";

import { useState, useRef, useEffect } from "react";
import { NACE_CODES, type NaceCode } from "@/data/nace-codes";
import { Tooltip } from "./Tooltip";

interface NaceAutocompleteProps {
  codeValue: string;
  descriptionValue: string;
  onCodeChange: (code: string, description: string) => void;
  tooltip?: string;
}

export function NaceAutocomplete({
  codeValue,
  descriptionValue,
  onCodeChange,
  tooltip,
}: NaceAutocompleteProps) {
  const [query, setQuery] = useState(codeValue ? `${codeValue} — ${descriptionValue}` : "");
  const [results, setResults] = useState<NaceCode[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (codeValue && descriptionValue && !query) {
      setQuery(`${codeValue} — ${descriptionValue}`);
    }
  }, [codeValue, descriptionValue, query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleInput(val: string) {
    setQuery(val);
    if (val.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    const q = val.toLowerCase();
    const filtered = NACE_CODES.filter(
      (n) => n.code.includes(q) || n.description.toLowerCase().includes(q)
    ).slice(0, 15);
    setResults(filtered);
    setOpen(filtered.length > 0);
  }

  function select(n: NaceCode) {
    setQuery(`${n.code} — ${n.description}`);
    onCodeChange(n.code, n.description);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <label className="flex items-center text-sm font-medium text-[var(--foreground)] mb-1.5">
        Codice ATECO
        {tooltip && <Tooltip text={tooltip} />}
      </label>
      <input
        type="text"
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => query.length >= 2 && results.length > 0 && setOpen(true)}
        placeholder="Cerca codice o descrizione..."
        className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1E5C3A]/30 focus:border-[#1E5C3A] transition-colors"
      />
      <p className="text-[10px] text-[var(--muted)] mt-1">Codice ATECO (compatibile NACE Rev. 2 per reporting europeo VSME/CSRD)</p>
      {open && (
        <ul className="absolute z-40 top-full left-0 right-0 mt-1 bg-white border border-[var(--border)] rounded-md shadow-lg max-h-56 overflow-y-auto">
          {results.map((n) => (
            <li key={n.code}>
              <button
                type="button"
                onClick={() => select(n)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
              >
                <span className="font-medium">{n.code}</span>
                <span className="text-[var(--muted)]"> — {n.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
