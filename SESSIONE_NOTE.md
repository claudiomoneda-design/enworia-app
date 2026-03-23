## Sessione 3 — Da fare

### 1. Calcolatore GHG (priorità)
- Fare un calcolo reale Scope 1 + Scope 2 con Claudio per capire tutti gli input
- Scope 1: combustione diretta (gas naturale, gasolio, GPL, altri combustibili)
- Scope 2: elettricità acquistata (kWh × fattore ISPRA Italia 2023 = 0,233 tCO2e/MWh)
- Ogni gas ha il suo GWP (CO2=1, CH4=28, N2O=265) — da definire quali raccogliere
- Architettura: dati grezzi salvati nel DB + calcolo automatico + possibilità di sovrascrivere con dato certificato esterno
- Costruire il modulo B3 nel form con calcolatore integrato

### 2. Form B3 — Energia
- Consumo totale energia (MWh)
- Breakdown: elettricità da rete, autoprodotta, combustibili
- Quota rinnovabile (%)

### 3. Prossimi moduli dopo B3
- B8 Forza lavoro
- B9 Salute e sicurezza
- B10/B11 Governance

### Stato attuale
- App Next.js funzionante su localhost:3001
- Supabase collegato con tabella companies (schema completo B1+B2)
- Form B1+B2 funzionante con salvataggio bozza
- generate_report.js e brand_engine.py pronti nella cartella template2
- Per riavviare: cd C:\Users\claud\Desktop\enworia poi npm run dev
