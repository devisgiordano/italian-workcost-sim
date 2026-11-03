# Italian Work Cost Simulator (`italian-workcost-sim`) 🇮🇹

> **Open Source Employer Cost & Tax Wedge Simulator: Employee (RAL) vs Freelancer (Partita IVA)**  
> *Simulatore del Costo Aziendale e del Cuneo Fiscale: Dipendente vs Partita IVA con integrazione visure Openapi.it*

[![License: MIT](https://img.shields.io/badge/License-MIT-indigo.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x%20Strict-blue.svg)](tsconfig.json)
[![Openapi.it](https://img.shields.io/badge/API-Openapi.it%20Company%20OAS-emerald.svg)](https://console.openapi.com/oas/it/company.openapi.json)

Applicazione web **open source** in **TypeScript puro (zero framework)** ed eseguibile direttamente in ambiente locale da un singolo file HTML (`index.html`), progettata per confrontare in modo analitico il **costo aziendale e il netto percepito** di un **Dipendente subordinato** rispetto a un **Professionista con Partita IVA** (Regime Forfettario 5% / 15% o Regime Ordinario).

Il simulatore integra le API **Company di Openapi.it** ([Documentazione OAS ufficiale](https://console.openapi.com/oas/it/company.openapi.json)) per calibrare automaticamente i parametri fiscali, previdenziali e regionali dell'azienda a partire dalla sua **Partita IVA** o **Codice Fiscale**.

---

## ✨ Funzionalità Principali

1. **Integrazione Visure e Bilanci Openapi.it (`/IT-advanced`, `/IT-full`, `/IT-marketing`, `/IT-start`)**:
   - **Regione della Sede Legale** $\rightarrow$ imposta automaticamente l'aliquota **IRAP regionale** (da `2,68%` a `4,97%`) e le **Addizionali Regionali/Comunali IRPEF**.
   - **Codice ATECO** $\rightarrow$ seleziona automaticamente il **Settore CCNL**, l'aliquota base **INPS datore**, la classe di rischio **INAIL**, il coefficiente di redditività **P.IVA** e l'eventuale **pro-rata di indetraibilità IVA** (es. settore bancario, assicurativo o sanitario).
   - **Organico Dipendenti a Bilancio** $\rightarrow$ determina lo scaglione dimensionale aziendale (`1-5`, `6-15`, `16-50`, `>50` dipendenti) per il calcolo dei contributi **FIS / CIGS** e del **Fondo Tesoreria INPS TFR**.
   - **Analisi di Impatto sul Bilancio** $\rightarrow$ confronta il nuovo costo con il **Fatturato (`turnover`)**, il **Costo Totale del Personale (`Voce B9`)**, l'**EBITDA** e lo **Stipendio Medio Aziendale (`avgGrossSalary`)**.

2. **Tre Modalità di Simulazione (Diretta e Inversa)**:
   - **1. Input Diretto (RAL vs Compenso P.IVA)**: inserisci la RAL e il compenso annuo P.IVA per confrontare costi e netti.
   - **2. A Parità di Netto Lavoratore**: imposta il netto annuo desiderato dal lavoratore; l'algoritmo di bisezione calcola al centesimo quale RAL Dipendente e quale Fatturato P.IVA servono per garantire lo stesso netto.
   - **3. A Parità di Budget Aziendale**: imposta il budget massimo aziendale e scopri quanto netto riceve il lavoratore nei due inquadramenti.

3. **Calcolo Break-Even e Valutazione Rischio Monocommittenza**:
   - Calcola automaticamente la **Tariffa Giornaliera e Annua P.IVA di pareggio** (sia lato azienda sia lato lavoratore).
   - Include indicatori di rischio giuslavoristico per falsa P.IVA / etero-organizzazione (*Art. 2 D.Lgs. 81/2015*) e soglia *85.000 €* del Regime Forfettario.

---

## 🚀 Avvio Rapido in Locale

Il progetto non richiede alcun server backend:

1. **Clona il repository**:
   ```bash
   git clone https://github.com/devisgiordano/italian-workcost-sim.git
   cd italian-workcost-sim
   ```
2. **Esecuzione immediata**:
   - Apri direttamente il file **`index.html`** in qualsiasi browser moderno (funziona anche via protocollo locale `file://`), oppure tramite un server statico locale (es. anteprima integrata di PhpStorm / VS Code Live Server).
3. **Compilazione TypeScript (se modifichi i file `.ts`)**:
   ```bash
   npm install
   npm run build
   ```
   *(Oppure `npm run watch` per ricompilare in tempo reale durante lo sviluppo).*

---

## 🔑 Configurazione della Chiave API Openapi.it (Sicurezza Open Source)

Il simulatore include già **4 aziende Sandbox preconfigurate** conformi allo schema ufficiale `company.openapi.json` (`12485671007`, `12345678910`, `08973210964`, `04128950271`) per testare subito tutte le funzionalità anche senza token.

Per interrogare in tempo reale **Openapi.it** con il tuo Bearer Token senza rischiare di pubblicare la chiave su GitHub, hai **due modalità sicure**:

### Opzione A — Dalla UI del Browser (`localStorage`)
1. Clicca sul pulsante **`⚙ Configura API Key`** in alto a destra nell'interfaccia.
2. Inserisci il tuo **Bearer Token** e scegli l'ambiente (`SANDBOX` o `PRODUCTION`).
3. Il token viene salvato esclusivamente nel `localStorage` del tuo browser (puoi rimuoverlo in qualsiasi momento con il tasto **`🗑 Cancella Token Salvato`**).

### Opzione B — Tramite file locale escluso da Git (`config.local.js`)
1. Duplica il file `config.local.example.js` e rinominalo in **`config.local.js`** *(già presente nel `.gitignore`)*.
2. Inserisci il tuo Bearer Token:
   ```javascript
   window.APP_LOCAL_CONFIG = {
     OPENAPI: {
       API_KEY: 'IL_TUO_BEARER_TOKEN_OPENAPI',
       ENVIRONMENT: 'PRODUCTION', // oppure 'SANDBOX'
       CORS_PROXY: ''
     }
   };
   ```
3. Ricarica `index.html`: il simulatore caricherà automaticamente le tue credenziali locali.

---

## 📁 Struttura del Progetto

```text
├── index.html                  # Interfaccia single-page completa (Tailwind CSS + Print PDF)
├── config.ts                   # Costanti fiscali, INPS/INAIL/IRAP, mappature ATECO e config API (TypeScript)
├── config.js                   # Output compilato da config.ts
├── config.local.example.js     # Template per configurazione API Key locale (config.local.js è in .gitignore)
├── app.ts                      # Motore di simulazione, client Openapi.it e controller DOM (TypeScript)
├── app.js                      # Output compilato da app.ts
├── tsconfig.json               # Configurazione compilatore TypeScript (strict mode)
├── package.json                # Script di build e metadati pacchetto (MIT)
├── .github/workflows/deploy.yml# Workflow GitHub Actions per deploy automatico su GitHub Pages
└── LICENSE                     # Licenza Open Source MIT
```

---

## ⚖️ Disclaimer Fiscale e Legale

Questo software è fornito *"così com'è" (AS IS)* sotto **Licenza MIT**, a scopo esclusivamente informativo, didattico e di simulazione preliminare.  
I calcoli fiscali, contributivi e previdenziali (IRPEF, INPS, INAIL, TFR, IRES, IRAP, Casse Professionali) si basano su parametri medi e aliquote standard della normativa italiana vigente (2025/2026) e **non sostituiscono in alcun modo il parere professionale di un Dottore Commercialista o di un Consulente del Lavoro**.

---

## 📄 Licenza e Autore

Creato da **[Devis Giordano (@devisgiordano)](https://github.com/devisgiordano)**.  
Distribuito sotto **Licenza MIT**. Consulta il file [`LICENSE`](LICENSE) per i dettagli completi.
