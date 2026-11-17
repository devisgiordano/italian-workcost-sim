"use strict";
/**
 * ============================================================================
 * FILE DI CONFIGURAZIONE E COSTANTI DEL PROGETTO (config.ts)
 * ============================================================================
 * In questo file sono definite:
 * 1. Le credenziali e gli endpoint per le API Visure Camerali di Openapi.it
 *    Documentazione OAS: https://console.openapi.com/oas/it/company.openapi.json
 * 2. Le costanti fiscali, previdenziali (INPS, INAIL, TFR, Casse Professionali)
 *    e tributarie (IRPEF, IRES, IRAP regionali, Regime Forfettario e Ordinario)
 * 3. Le mappature automatiche Codice ATECO -> Settore CCNL / Rischio INAIL / IVA
 * 4. I profili Sandbox di test conformi allo schema ufficiale Openapi.it
 * ============================================================================
 */
const APP_CONFIG = {
    // ==========================================================================
    // 1. CONFIGURAZIONE OPENAPI.IT (CHIAVE API ED ENDPOINT)
    // ==========================================================================
    OPENAPI: {
        // Sostituisci con il tuo Bearer Token reale in config.local.js (escluso da Git) oppure dalla UI
        API_KEY: 'INSERISCI_QUI_LA_TUA_API_KEY_OPENAPI',
        ENVIRONMENT: 'SANDBOX',
        BASE_URLS: {
            PRODUCTION: 'https://company.openapi.com',
            SANDBOX: 'https://test.company.openapi.com'
        },
        DEFAULT_ENDPOINT: '/IT-advanced',
        ENDPOINTS: {
            IT_START: '/IT-start',
            IT_ADVANCED: '/IT-advanced',
            IT_FULL: '/IT-full',
            IT_MARKETING: '/IT-marketing',
            IT_CHECK_ID: '/IT-check_id'
        },
        CORS_PROXY: '',
        REQUEST_TIMEOUT_MS: 15000,
        ASYNC_POLL_INTERVAL_MS: 2500,
        ASYNC_MAX_RETRIES: 4
    },
    // ==========================================================================
    // 2. COSTANTI FISCALI, PREVIDENZIALI E DEL LAVORO (NORMATIVA VIGENTE 2025/2026)
    // ==========================================================================
    FISCAL: {
        IRES_RATE: 24.0, // Aliquota IRES ordinaria società di capitali (24%)
        TFR_DIVISOR: 13.5, // Divisore legale accantonamento TFR (Art. 2120 c.c.)
        TFR_INPS_GUARANTEE_OFFSET: 0.50, // Rivalsa 0,50% su quota TFR per contributo L. 297/82
        TFR_GUARANTEE_FUND_EMPLOYER: 0.20, // Contributo Fondo di Garanzia TFR INPS (0,20%)
        STAMP_DUTY_INVOICE: 2.0, // Imposta di bollo su fatture esenti/forfettarie > 77,47€
        STANDARD_VAT_RATE: 22.0, // Aliquota IVA ordinaria (22%)
        FORFETTARIO_LIMIT_CURRENT: 85000, // Limite ricavi/compensi Regime Forfettario vigente (85.000 €)
        FORFETTARIO_LIMIT_PROPOSED: 100000, // Ipotesi innalzamento soglia Forfettario (100.000 €)
        // Scaglioni IRPEF 2025/2026 (3 aliquote: 23%, 35%, 43%)
        IRPEF_BRACKETS: [
            { min: 0, max: 28000, rate: 0.23, label: 'Fino a 28.000 € (23%)' },
            { min: 28000, max: 50000, rate: 0.35, label: 'Da 28.000 € a 50.000 € (35%)' },
            { min: 50000, max: null, rate: 0.43, label: 'Oltre 50.000 € (43%)' }
        ],
        // Contributi FIS / CIGS aggiuntivi in base al numero di dipendenti (rilevato da visura Openapi)
        COMPANY_SIZE_SURCHARGES: {
            MICRO_1_5: {
                maxEmployees: 5,
                fisRate: 0.33,
                label: 'Microimpresa (1 - 5 dipendenti) • FIS ridotto (+0,33%)'
            },
            SMALL_6_15: {
                maxEmployees: 15,
                fisRate: 0.53,
                label: 'Piccola Impresa (6 - 15 dipendenti) • FIS ordinario (+0,53%)'
            },
            MEDIUM_16_50: {
                maxEmployees: 50,
                fisRate: 0.90,
                label: 'Media Impresa (16 - 50 dipendenti) • FIS maggiorato / CIGS (+0,90%)'
            },
            LARGE_OVER_50: {
                maxEmployees: 999999,
                fisRate: 1.40,
                label: 'Grande Impresa (> 50 dipendenti) • CIGS + Fondo Tesoreria TFR (+1,40%)'
            }
        },
        // Inquadramento contrattuale dipendente
        QUALIFICATIONS: {
            IMPIEGATO: {
                label: 'Impiegato (Middle / Specialist)',
                employerRateDelta: 0.0,
                extraFundsAnnual: 240, // es. Fondo Est / SanArti / Metasalute
                defaultMensilita: 14
            },
            OPERAIO: {
                label: 'Operaio (Produzione / Logistica)',
                employerRateDelta: 0.55,
                extraFundsAnnual: 210,
                defaultMensilita: 13
            },
            QUADRO: {
                label: 'Quadro Direttivo (Manager / Tech Lead)',
                employerRateDelta: 0.35,
                extraFundsAnnual: 450, // es. QuAS (Cassa Assistenza Quadri)
                defaultMensilita: 14
            },
            DIRIGENTE: {
                label: 'Dirigente (Executive / C-Level)',
                employerRateDelta: 1.80,
                extraFundsAnnual: 3800, // Previndai / FASI / Assicurazioni obbligatorie CCNL Dirigenti
                defaultMensilita: 14
            },
            APPRENDISTA: {
                label: 'Apprendista Professionalizzante',
                employerRateDelta: -17.37, // Aliquota ridotta ~11.61%
                employeeRateOverride: 5.84, // Aliquota INPS carico apprendista ridotta al 5,84%
                extraFundsAnnual: 240,
                defaultMensilita: 14
            }
        },
        // Mappatura Regioni Italiane (codici ISTAT/Openapi.it + Aliquote IRAP e Addizionali IRPEF)
        REGIONS: {
            '01': { code: '01', name: 'Piemonte', irapRate: 3.90, addRegIrpef: 2.15, addComIrpef: 0.80 },
            '02': { code: '02', name: "Valle d'Aosta", irapRate: 3.90, addRegIrpef: 1.23, addComIrpef: 0.50 },
            '03': { code: '03', name: 'Lombardia', irapRate: 3.90, addRegIrpef: 1.73, addComIrpef: 0.80 },
            '04': { code: '04', name: 'Trentino-Alto Adige', irapRate: 2.68, addRegIrpef: 1.23, addComIrpef: 0.50 },
            '05': { code: '05', name: 'Veneto', irapRate: 3.90, addRegIrpef: 1.23, addComIrpef: 0.78 },
            '06': { code: '06', name: 'Friuli-Venezia Giulia', irapRate: 3.90, addRegIrpef: 1.23, addComIrpef: 0.70 },
            '07': { code: '07', name: 'Liguria', irapRate: 3.90, addRegIrpef: 1.85, addComIrpef: 0.80 },
            '08': { code: '08', name: 'Emilia-Romagna', irapRate: 3.90, addRegIrpef: 1.93, addComIrpef: 0.80 },
            '09': { code: '09', name: 'Toscana', irapRate: 3.90, addRegIrpef: 1.68, addComIrpef: 0.80 },
            '10': { code: '10', name: 'Umbria', irapRate: 3.90, addRegIrpef: 1.82, addComIrpef: 0.80 },
            '11': { code: '11', name: 'Marche', irapRate: 4.73, addRegIrpef: 1.70, addComIrpef: 0.80 },
            '12': { code: '12', name: 'Lazio', irapRate: 4.82, addRegIrpef: 2.73, addComIrpef: 0.90 },
            '13': { code: '13', name: 'Abruzzo', irapRate: 4.82, addRegIrpef: 1.73, addComIrpef: 0.80 },
            '14': { code: '14', name: 'Molise', irapRate: 4.97, addRegIrpef: 2.33, addComIrpef: 0.80 },
            '15': { code: '15', name: 'Campania', irapRate: 4.97, addRegIrpef: 2.73, addComIrpef: 0.80 },
            '16': { code: '16', name: 'Puglia', irapRate: 4.82, addRegIrpef: 1.73, addComIrpef: 0.80 },
            '17': { code: '17', name: 'Basilicata', irapRate: 3.90, addRegIrpef: 1.23, addComIrpef: 0.80 },
            '18': { code: '18', name: 'Calabria', irapRate: 4.82, addRegIrpef: 2.03, addComIrpef: 0.80 },
            '19': { code: '19', name: 'Sicilia', irapRate: 4.82, addRegIrpef: 1.23, addComIrpef: 0.80 },
            '20': { code: '20', name: 'Sardegna', irapRate: 3.90, addRegIrpef: 1.23, addComIrpef: 0.75 }
        },
        // Settori economici e mappatura automatica dai codici ATECO di Openapi.it
        SECTORS: [
            {
                id: 'TECH_PROFESSIONALS',
                label: 'Informatica, Software, Consulenza & Servizi Professionali',
                ccnlReference: 'CCNL Terziario Confcommercio / Metalmeccanico IT / Studi Professionali',
                atecoPrefixes: ['58', '59', '60', '61', '62', '63', '69', '70', '71', '72', '73', '74', '78', '82'],
                inpsEmployerBaseRate: 28.98,
                inpsEmployeeBaseRate: 9.19,
                inailDefaultRate: 0.40, // Rischio basso (ufficio/terminali)
                bilateralFundsAnnual: 240,
                defaultVatDeductibility: 100,
                defaultForfettarioCoeff: 78
            },
            {
                id: 'COMMERCE_TOURISM',
                label: 'Commercio, Distribuzione, Logistica & Turismo/Ristorazione',
                ccnlReference: 'CCNL Commercio e Servizi / Logistica / Pubblici Esercizi',
                atecoPrefixes: ['45', '46', '47', '49', '50', '51', '52', '53', '55', '56', '79'],
                inpsEmployerBaseRate: 29.18,
                inpsEmployeeBaseRate: 9.19,
                inailDefaultRate: 0.90,
                bilateralFundsAnnual: 260,
                defaultVatDeductibility: 100,
                defaultForfettarioCoeff: 67
            },
            {
                id: 'INDUSTRY_MANUFACTURING',
                label: 'Industria, Manifattura, Metalmeccanica, Chimica & Energia',
                ccnlReference: 'CCNL Metalmeccanica Industria / Chimico / Alimentare',
                atecoPrefixes: ['10', '11', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '35', '36', '38'],
                inpsEmployerBaseRate: 30.18,
                inpsEmployeeBaseRate: 9.19,
                inailDefaultRate: 1.80,
                bilateralFundsAnnual: 200,
                defaultVatDeductibility: 100,
                defaultForfettarioCoeff: 67
            },
            {
                id: 'CONSTRUCTION_REALESTATE',
                label: 'Edilizia, Ingegneria Civile, Impiantistica & Immobiliare',
                ccnlReference: 'CCNL Edilizia Industria / Artigianato + Cassa Edile',
                atecoPrefixes: ['41', '42', '43', '68'],
                inpsEmployerBaseRate: 33.40,
                inpsEmployeeBaseRate: 9.19,
                inailDefaultRate: 4.50,
                bilateralFundsAnnual: 650,
                defaultVatDeductibility: 100,
                defaultForfettarioCoeff: 86
            },
            {
                id: 'FINANCE_INSURANCE_HEALTH',
                label: 'Banche, Assicurazioni, Finanza, Sanità & Istruzione (Pro-Rata IVA)',
                ccnlReference: 'CCNL Credito ABI / ANIA / Sanità Privata',
                atecoPrefixes: ['64', '65', '66', '85', '86', '87', '88'],
                inpsEmployerBaseRate: 29.20,
                inpsEmployeeBaseRate: 9.19,
                inailDefaultRate: 0.45,
                bilateralFundsAnnual: 380,
                defaultVatDeductibility: 20, // Forte indetraibilità IVA su fatture P.IVA in regime ordinario!
                defaultForfettarioCoeff: 78
            }
        ],
        // Casse Previdenziali per il Professionista con Partita IVA
        CASSE_PREVIDENZIALI: [
            {
                id: 'GESTIONE_SEPARATA',
                label: 'Gestione Separata INPS (Consulenti, IT, Marketing, Freelance senza Albo)',
                description: 'Aliquota 26,07% sul reddito imponibile. Facoltà di addebitare in fattura la Rivalsa INPS del 4% (che costituisce compenso imponibile).',
                subjectiveRate: 26.07,
                integrativeRate: 4.0,
                integrativeIsTaxable: true,
                fixedMinimumAnnual: 0,
                fixedThresholdIncome: 0
            },
            {
                id: 'CASSA_ORDINE_PROFESSIONALE',
                label: 'Cassa Professionale di Ordine (Inarcassa, Cassa Forense, Commercialisti, ecc.)',
                description: 'Contributo soggettivo medio ~14,5% + Contributo integrativo 4% obbligatorio in fattura a carico dell\'azienda committente.',
                subjectiveRate: 14.50,
                integrativeRate: 4.0,
                integrativeIsTaxable: false,
                fixedMinimumAnnual: 2750,
                fixedThresholdIncome: 18965
            },
            {
                id: 'INPS_ARTIGIANI_COMMERCIANTI',
                label: 'Gestione INPS Artigiani e Commercianti (Ditta Individuale / Sviluppo / E-commerce)',
                description: 'Contributo fisso minimale (4.460 € fino a 18.415 € di reddito) + ~24,48% sull\'eccedenza (riducibile del 35% in Regime Forfettario).',
                subjectiveRate: 24.48,
                integrativeRate: 0.0,
                integrativeIsTaxable: false,
                fixedMinimumAnnual: 4460,
                fixedThresholdIncome: 18415
            }
        ],
        // Agevolazioni e sgravi all'assunzione dipendente
        HIRING_INCENTIVES: [
            {
                id: 'NONE',
                label: 'Ordinario (Nessuna agevolazione specifica)',
                description: 'Tassazione e contribuzione ordinaria a tempo indeterminato con deduzione 100% IRAP.',
                employerInpsDiscountPct: 0,
                maxAnnualDiscountEur: 0,
                extraIresDeductionPct: 0
            },
            {
                id: 'MAXIDEDUZIONE_IRES_120',
                label: 'Maxideduzione IRES 120% Nuove Assunzioni (Tempo Indeterminato)',
                description: 'Maggiorazione del 20% del costo del lavoro deducibile ai fini IRES (risparmio extra 4,8% sul costo del lavoro).',
                employerInpsDiscountPct: 0,
                maxAnnualDiscountEur: 0,
                extraIresDeductionPct: 20
            },
            {
                id: 'BONUS_GIOVANI_UNDER_35',
                label: 'Bonus Giovani Under 35 / Donne / ZES (Esonero 100% INPS fino a 6.000 €/anno)',
                description: 'Esonero del 100% dei contributi previdenziali a carico del datore di lavoro (escluso INAIL) fino a 500 €/mese (6.000 €/anno) + Maxideduzione IRES 130%.',
                employerInpsDiscountPct: 100,
                maxAnnualDiscountEur: 6000,
                extraIresDeductionPct: 30
            },
            {
                id: 'DECONTRIBUZIONE_SUD',
                label: 'Incentivo Occupazione Mezzogiorno / PMI (Esonero 30% INPS fino a 3.000 €/anno)',
                description: 'Riduzione del 30% dei contributi INPS a carico del datore di lavoro per sedi operative nel Mezzogiorno.',
                employerInpsDiscountPct: 30,
                maxAnnualDiscountEur: 3000,
                extraIresDeductionPct: 0
            }
        ],
        FORFETTARIO_COEFFICIENTS: [
            { code: '78', label: '78% — Attività Professionali, Scientifiche, Tecniche, Informatiche (ATECO 62, 69-74, 85, 86)', coeff: 78 },
            { code: '67', label: '67% — Altre Attività Economiche, Servizi alle Imprese, Artigianato Software (ATECO 63, 77-82)', coeff: 67 },
            { code: '86', label: '86% — Costruzioni, Ingegneria Civile e Attività Immobiliari (ATECO 41-43, 68)', coeff: 86 },
            { code: '40', label: '40% — Commercio all\'Ingrosso e al Dettaglio, Ristorazione (ATECO 45-47, 55-56)', coeff: 40 }
        ]
    },
    // ==========================================================================
    // 3. VISURE AZIENDALI DI ESEMPIO / SANDBOX (CONFORMI ALL'OAS OPENAPI.IT)
    // ==========================================================================
    SANDBOX_PRESETS: {
        '12485671007': {
            id: '60d1bfc731177b0a092cdfc1',
            vatCode: '12485671007',
            taxCode: '12485671007',
            companyName: 'OPENAPI S.P.A.',
            activityStatus: 'ATTIVA',
            reaCode: '1378273',
            cciaa: 'RM',
            pec: 'openapi@legalmail.it',
            sdiCode: 'USAL8PV',
            startDate: '2013-10-20',
            registrationDate: '2013-07-19',
            detailedLegalForm: {
                code: 'SP',
                description: 'SOCIETÀ PER AZIONI'
            },
            address: {
                registeredOffice: {
                    toponym: 'VIALE',
                    street: 'FILIPPO TOMMASO MARINETTI',
                    streetNumber: '221',
                    streetName: 'VIALE FILIPPO TOMMASO MARINETTI 221',
                    town: 'ROMA',
                    province: 'RM',
                    zipCode: '00143',
                    townCode: 'H501',
                    region: {
                        code: '12',
                        description: 'LAZIO'
                    }
                }
            },
            atecoClassification: {
                ateco: {
                    code: '6201',
                    description: "Produzione di software non connesso all'edizione"
                },
                ateco2022: {
                    code: '6201',
                    description: "Produzione di software non legata all'editoria"
                }
            },
            balanceSheets: {
                last: {
                    year: 2022,
                    employees: 14,
                    balanceSheetDate: '2022-12-31',
                    turnover: 4043407,
                    netWorth: 166491,
                    shareCapital: 50000,
                    totalStaffCost: 604997,
                    totalAssets: 1483126,
                    avgGrossSalary: 43214.07
                },
                all: [
                    { year: 2024, employees: 15, balanceSheetDate: '2024-12-31', turnover: 4890000, netWorth: 590000, shareCapital: 50000, totalStaffCost: 665000, avgGrossSalary: 44333.33 },
                    { year: 2023, employees: 15, balanceSheetDate: '2023-12-31', turnover: 4520000, netWorth: 510000, shareCapital: 50000, totalStaffCost: 642000, avgGrossSalary: 42800.00 },
                    { year: 2022, employees: 14, balanceSheetDate: '2022-12-31', turnover: 4043407, netWorth: 166491, shareCapital: 50000, totalStaffCost: 604997, totalAssets: 1483126, avgGrossSalary: 43214.07 },
                    { year: 2021, employees: 15, balanceSheetDate: '2021-12-31', turnover: 4432761, netWorth: 469366, shareCapital: 50000, totalStaffCost: 618000, avgGrossSalary: 41200.00 }
                ]
            },
            operatingResults: {
                ebitda: 714856,
                ebit: 682714,
                cashFlow: 501508
            },
            innovativeSmeAndSu: {
                isInnovativeStartUp: false,
                isInnovativeSme: true
            }
        },
        '12345678910': {
            id: '45d1bfc788174b9u092cdtr5',
            vatCode: '12345678910',
            taxCode: '12345678910',
            companyName: 'OPENAPI TEST S.P.A.',
            activityStatus: 'REGISTRATA',
            reaCode: '2366289',
            cciaa: 'RM',
            pec: 'openapitest@legalmail.it',
            sdiCode: 'USAL8PV',
            startDate: '2016-10-25',
            registrationDate: '2016-06-11',
            detailedLegalForm: {
                code: 'SP',
                description: 'SOCIETÀ PER AZIONI'
            },
            address: {
                registeredOffice: {
                    toponym: 'VIALE',
                    street: 'ROMANITA',
                    streetNumber: '11',
                    streetName: 'VIALE ROMANITA 11',
                    town: 'ROMA',
                    province: 'RM',
                    zipCode: '00143',
                    townCode: 'H501',
                    region: {
                        code: '12',
                        description: 'LAZIO'
                    }
                }
            },
            atecoClassification: {
                ateco: {
                    code: '6201',
                    description: 'Attività di programmazione informatica'
                },
                ateco2022: {
                    code: '6201',
                    description: "Produzione di software non legata all'editoria"
                }
            },
            balanceSheets: {
                last: {
                    year: 2021,
                    employees: 5,
                    balanceSheetDate: '2021-12-31',
                    turnover: 345678,
                    netWorth: 145678,
                    shareCapital: 20000,
                    totalStaffCost: 213330,
                    totalAssets: 1083126,
                    avgGrossSalary: 42666.09
                },
                all: [
                    { year: 2021, employees: 5, balanceSheetDate: '2021-12-31', turnover: 345678, netWorth: 145678, shareCapital: 20000, totalStaffCost: 213330, totalAssets: 1083126, avgGrossSalary: 42666.09 }
                ]
            }
        },
        '08973210964': {
            id: 'demo-meccanica-lombardia',
            vatCode: '08973210964',
            taxCode: '08973210964',
            companyName: 'OFFICINE MECCANICHE BRESCIANE S.R.L.',
            activityStatus: 'ATTIVA',
            reaCode: '1984312',
            cciaa: 'MI',
            pec: 'omb.srl@legalmail.it',
            sdiCode: 'M5UXCR1',
            startDate: '2011-03-14',
            registrationDate: '2011-02-28',
            detailedLegalForm: {
                code: 'SR',
                description: 'SOCIETÀ A RESPONSABILITÀ LIMITATA'
            },
            address: {
                registeredOffice: {
                    streetName: 'VIA DELL\'INDUSTRIA 48',
                    town: 'MILANO',
                    province: 'MI',
                    zipCode: '20128',
                    region: {
                        code: '03',
                        description: 'LOMBARDIA'
                    }
                }
            },
            atecoClassification: {
                ateco: {
                    code: '2899',
                    description: 'Fabbricazione di altre macchine per impieghi speciali e automazione industriale'
                }
            },
            balanceSheets: {
                last: {
                    year: 2023,
                    employees: 38,
                    balanceSheetDate: '2023-12-31',
                    turnover: 8950000,
                    netWorth: 2410000,
                    shareCapital: 100000,
                    totalStaffCost: 1976000,
                    totalAssets: 6820000,
                    avgGrossSalary: 37500.00
                },
                all: [
                    { year: 2023, employees: 38, balanceSheetDate: '2023-12-31', turnover: 8950000, netWorth: 2410000, shareCapital: 100000, totalStaffCost: 1976000, avgGrossSalary: 37500.00 },
                    { year: 2022, employees: 35, balanceSheetDate: '2022-12-31', turnover: 8120000, netWorth: 2150000, shareCapital: 100000, totalStaffCost: 1785000, avgGrossSalary: 36800.00 }
                ]
            },
            operatingResults: {
                ebitda: 1340000,
                ebit: 980000,
                cashFlow: 1120000
            }
        },
        '04128950271': {
            id: 'demo-finanza-pro-rata',
            vatCode: '04128950271',
            taxCode: '04128950271',
            companyName: 'MEDIOVENETO ADVISORY & ASSICURAZIONI S.P.A.',
            activityStatus: 'ATTIVA',
            reaCode: '391024',
            cciaa: 'PD',
            pec: 'medioveneto@pec.it',
            sdiCode: 'T9K4ZHO',
            startDate: '2015-05-10',
            registrationDate: '2015-04-20',
            detailedLegalForm: {
                code: 'SP',
                description: 'SOCIETÀ PER AZIONI'
            },
            address: {
                registeredOffice: {
                    streetName: 'LARGO EUROPA 12',
                    town: 'PADOVA',
                    province: 'PD',
                    zipCode: '35137',
                    region: {
                        code: '05',
                        description: 'VENETO'
                    }
                }
            },
            atecoClassification: {
                ateco: {
                    code: '6622',
                    description: 'Attività di agenti e mediatori di assicurazioni'
                }
            },
            balanceSheets: {
                last: {
                    year: 2023,
                    employees: 62,
                    balanceSheetDate: '2023-12-31',
                    turnover: 14200000,
                    netWorth: 4100000,
                    shareCapital: 500000,
                    totalStaffCost: 3968000,
                    totalAssets: 19500000,
                    avgGrossSalary: 46500.00
                }
            },
            operatingResults: {
                ebitda: 2890000,
                ebit: 2610000,
                cashFlow: 2150000
            }
        }
    }
};
// Fusione automatica con eventuale file config.local.js (ignorato da Git per proteggere la chiave API)
const localOverride = window.APP_LOCAL_CONFIG;
if (localOverride?.OPENAPI) {
    Object.assign(APP_CONFIG.OPENAPI, localOverride.OPENAPI);
}
// Esponiamo APP_CONFIG anche su window per l'esecuzione diretta in browser senza bundler
window.APP_CONFIG = APP_CONFIG;
