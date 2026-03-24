-- Motivazioni predefinite per esclusione/verifica Scope 3
CREATE TABLE IF NOT EXISTS scope3_exclusion_reasons (
  id    SERIAL PRIMARY KEY,
  text  TEXT NOT NULL,
  applies_to TEXT[] NOT NULL  -- array di classificazioni: 'not_significant', 'to_verify', 'excluded_na'
);

-- RLS
ALTER TABLE scope3_exclusion_reasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scope3_exclusion_reasons_all" ON scope3_exclusion_reasons FOR ALL USING (true) WITH CHECK (true);

-- Seed
INSERT INTO scope3_exclusion_reasons (text, applies_to) VALUES
('Attività non presente nell''organizzazione', '{"excluded_na","not_significant"}'),
('Emissioni stimate < 1% del totale inventario', '{"not_significant"}'),
('Dati non disponibili e non stimabili con ragionevole accuratezza', '{"not_significant","to_verify"}'),
('Inclusa in altra categoria (evitare doppia contabilizzazione)', '{"excluded_na","not_significant"}'),
('Trasporto gestito direttamente dai fornitori — incluso in Cat. 4.1', '{"not_significant","excluded_na"}'),
('Nessun bene noleggiato nell''anno di rendicontazione', '{"excluded_na"}'),
('Nessun investimento finanziario rilevante', '{"excluded_na"}'),
('Prodotti venduti non generano emissioni significative in fase d''uso', '{"not_significant","excluded_na"}'),
('Rifiuti gestiti da terzi — impatto stimato trascurabile', '{"not_significant"}'),
('Pendolarismo dipendenti — impatto marginale per organizzazione < 20 dipendenti', '{"not_significant"}'),
('Viaggi di lavoro assenti o trascurabili', '{"not_significant","excluded_na"}'),
('Da approfondire nella prossima rendicontazione', '{"to_verify"}'),
('Dati parziali disponibili — necessaria raccolta dati aggiuntiva', '{"to_verify"}'),
('Fornitore non ancora in grado di fornire dati specifici', '{"to_verify"}')
ON CONFLICT DO NOTHING;
