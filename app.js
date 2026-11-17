"use strict";
/**
 * ============================================================================
 * MOTORE DI SIMULAZIONE E INTEGRAZIONE OPENAPI.IT (app.ts)
 * ============================================================================
 * Pure TypeScript senza framework esterni.
 * Utilizza le costanti globali definite in config.ts (APP_CONFIG).
 * ============================================================================
 */
// ============================================================================
// SERVIZIO INTEGRAZIONE OPENAPI.IT (Visure Camerali e Bilanci)
// ============================================================================
class OpenApiClientService {
    constructor(settings) {
        // Clona la configurazione iniziale da config.ts
        this.config = { ...settings, BASE_URLS: { ...settings.BASE_URLS }, ENDPOINTS: { ...settings.ENDPOINTS } };
        this.loadFromLocalStorage();
    }
    getSettings() {
        return this.config;
    }
    updateSettings(partial, persistToStorage = true) {
        this.config = { ...this.config, ...partial };
        if (persistToStorage) {
            this.saveToLocalStorage();
        }
    }
    clearSavedSettings() {
        try {
            window.localStorage.removeItem(OpenApiClientService.STORAGE_KEY);
        }
        catch {
            // Ignora errori storage in modalità file:// restrittiva
        }
        this.config.API_KEY = APP_CONFIG.OPENAPI.API_KEY;
        this.config.ENVIRONMENT = APP_CONFIG.OPENAPI.ENVIRONMENT;
        this.config.CORS_PROXY = APP_CONFIG.OPENAPI.CORS_PROXY;
    }
    loadFromLocalStorage() {
        try {
            const raw = window.localStorage.getItem(OpenApiClientService.STORAGE_KEY);
            if (!raw)
                return;
            const parsed = JSON.parse(raw);
            if (parsed.API_KEY && parsed.API_KEY !== 'INSERISCI_QUI_LA_TUA_API_KEY_OPENAPI') {
                this.config.API_KEY = parsed.API_KEY;
            }
            if (parsed.ENVIRONMENT === 'SANDBOX' || parsed.ENVIRONMENT === 'PRODUCTION') {
                this.config.ENVIRONMENT = parsed.ENVIRONMENT;
            }
            if (typeof parsed.CORS_PROXY === 'string') {
                this.config.CORS_PROXY = parsed.CORS_PROXY;
            }
        }
        catch {
            // Ignora errori di accesso a localStorage
        }
    }
    saveToLocalStorage() {
        try {
            const toSave = {
                API_KEY: this.config.API_KEY,
                ENVIRONMENT: this.config.ENVIRONMENT,
                CORS_PROXY: this.config.CORS_PROXY
            };
            window.localStorage.setItem(OpenApiClientService.STORAGE_KEY, JSON.stringify(toSave));
        }
        catch {
            // Ignora errori di accesso a localStorage
        }
    }
    hasValidCustomToken() {
        const key = (this.config.API_KEY || '').trim();
        return key.length > 8 && key !== 'INSERISCI_QUI_LA_TUA_API_KEY_OPENAPI';
    }
    /**
     * Eventuali override locali sono caricati tramite config.local.js (window.APP_LOCAL_CONFIG)
     * o salvati in localStorage dal modale UI; nessuna chiamata fetch a file .ts necessaria.
     */
    async syncApiKeyFromTsSourceIfAvailable() {
        return;
    }
    /**
     * Interroga l'endpoint Openapi.it (es. /IT-advanced/{vatCode} o /IT-full/{vatCode})
     * Gestisce anche le risposte asincrone 302 / PENDING tramite /IT-check_id/{id}
     */
    async fetchCompanyVisura(vatOrTaxCode, endpointOverride) {
        const cleanCode = vatOrTaxCode.replace(/\s+/g, '').replace(/^IT/i, '').toUpperCase();
        const endpoint = endpointOverride || this.config.DEFAULT_ENDPOINT;
        if (!cleanCode || cleanCode.length < 11) {
            throw new Error('Inserisci una Partita IVA valida (11 cifre) o un Codice Fiscale valido.');
        }
        // Se è disponibile un Bearer Token reale configurato, eseguiamo la chiamata REST su Openapi.it
        if (this.hasValidCustomToken()) {
            const baseUrl = this.config.ENVIRONMENT === 'PRODUCTION'
                ? this.config.BASE_URLS.PRODUCTION
                : this.config.BASE_URLS.SANDBOX;
            const rawUrl = `${baseUrl}${endpoint}/${encodeURIComponent(cleanCode)}`;
            const finalUrl = this.config.CORS_PROXY ? `${this.config.CORS_PROXY}${rawUrl}` : rawUrl;
            const controller = new AbortController();
            const timeoutId = window.setTimeout(() => controller.abort(), this.config.REQUEST_TIMEOUT_MS);
            try {
                const response = await fetch(finalUrl, {
                    method: 'GET',
                    headers: {
                        Accept: 'application/json',
                        Authorization: `Bearer ${this.config.API_KEY.trim()}`
                    },
                    signal: controller.signal
                });
                window.clearTimeout(timeoutId);
                if (response.status === 204) {
                    throw new Error(`Nessuna azienda trovata su Openapi.it (${this.config.ENVIRONMENT}) per il codice ${cleanCode}.`);
                }
                const json = await response.json();
                if (!response.ok || json.success === false) {
                    const apiMsg = json.message || `Errore HTTP ${response.status}`;
                    throw new Error(`Errore API Openapi.it: ${apiMsg} (codice: ${json.error ?? response.status})`);
                }
                // Gestione caso asincrono (state === 'PENDING' su /IT-full, /IT-marketing, /IT-aml)
                let dataPayload = json.data;
                if (dataPayload && !Array.isArray(dataPayload) && dataPayload.state === 'PENDING' && dataPayload.id) {
                    dataPayload = await this.pollAsyncCheckId(baseUrl, dataPayload.id);
                }
                const normalized = this.normalizeOpenApiPayload(dataPayload, cleanCode);
                return {
                    visura: normalized,
                    source: 'LIVE_API',
                    endpointUsed: `${baseUrl}${endpoint}/${cleanCode}`
                };
            }
            catch (err) {
                window.clearTimeout(timeoutId);
                // Se la P.IVA è tra i preset Sandbox ufficiali, offriamo il fallback intelligente segnalando il motivo
                if (APP_CONFIG.SANDBOX_PRESETS[cleanCode]) {
                    console.warn('Chiamata live fallita o bloccata da CORS, utilizzo preset Sandbox conforme OAS:', err);
                    return {
                        visura: APP_CONFIG.SANDBOX_PRESETS[cleanCode],
                        source: 'SANDBOX_PRESET',
                        endpointUsed: `Preset OAS (${endpoint}/${cleanCode})`
                    };
                }
                const message = err instanceof Error ? err.message : String(err);
                throw new Error(message);
            }
        }
        // Se l'utente non ha ancora inserito il Bearer Token, controlla i preset Sandbox inclusi
        if (APP_CONFIG.SANDBOX_PRESETS[cleanCode]) {
            return {
                visura: APP_CONFIG.SANDBOX_PRESETS[cleanCode],
                source: 'SANDBOX_PRESET',
                endpointUsed: `Sandbox Locale (${endpoint}/${cleanCode})`
            };
        }
        throw new Error(`Chiave API Openapi.it non ancora configurata in config.ts. Per interrogare qualsiasi P.IVA reale (${cleanCode}), inserisci il tuo Bearer Token in config.ts (o nel pannello "Configurazione API"), oppure prova una delle Partite IVA Sandbox precaricate (es. 12485671007).`);
    }
    async pollAsyncCheckId(baseUrl, requestId) {
        for (let attempt = 1; attempt <= this.config.ASYNC_MAX_RETRIES; attempt++) {
            await new Promise((resolve) => window.setTimeout(resolve, this.config.ASYNC_POLL_INTERVAL_MS));
            const checkUrl = `${baseUrl}${this.config.ENDPOINTS.IT_CHECK_ID}/${encodeURIComponent(requestId)}`;
            const finalUrl = this.config.CORS_PROXY ? `${this.config.CORS_PROXY}${checkUrl}` : checkUrl;
            const resp = await fetch(finalUrl, {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${this.config.API_KEY.trim()}`
                }
            });
            const json = await resp.json();
            if (json?.data && json.data.state !== 'PENDING') {
                return json.data;
            }
        }
        throw new Error(`Richiesta asincrona Openapi.it (ID: ${requestId}) ancora in elaborazione. Riprova tra qualche secondo.`);
    }
    /**
     * Normalizza le risposte provenienti da /IT-advanced, /IT-start, /IT-full o /IT-marketing
     * in un unico oggetto tipizzato OpenApiCompanyVisura.
     */
    normalizeOpenApiPayload(rawData, fallbackVat) {
        const item = Array.isArray(rawData) ? rawData[0] : rawData;
        if (!item || typeof item !== 'object') {
            throw new Error('Formato risposta Openapi.it non valido o vuoto.');
        }
        // Caso 1: Schema /IT-full o /IT-marketing (ha companyDetails annidato)
        if (item.companyDetails) {
            const cd = item.companyDetails;
            const addr = item.address || {};
            const ecofin = item.ecofin || {};
            const emp = item.employees || {};
            const statusCode = item.companyStatus?.activityStatus?.code || 'A';
            const employeesCount = typeof emp.employee === 'number' ? emp.employee : null;
            const turnoverVal = typeof ecofin.turnover === 'number' ? ecofin.turnover : null;
            return {
                id: cd.openapiNumber || item.id,
                vatCode: cd.vatCode || fallbackVat,
                taxCode: cd.taxCode || cd.vatCode || fallbackVat,
                companyName: cd.companyName || 'Azienda Sconosciuta',
                activityStatus: statusCode === 'A' ? 'ATTIVA' : (item.companyStatus?.activityStatus?.description || statusCode),
                reaCode: cd.reaCode,
                cciaa: cd.cciaa,
                pec: typeof item.pec === 'string' ? item.pec : item.pec?.pec,
                detailedLegalForm: item.legalForm?.detailedLegalForm || item.legalForm?.legalForm,
                address: {
                    registeredOffice: {
                        streetName: addr.streetName,
                        town: addr.town,
                        zipCode: addr.zipCode,
                        province: addr.province?.code || addr.province,
                        region: addr.region
                    }
                },
                atecoClassification: item.atecoClassification,
                balanceSheets: {
                    last: {
                        year: ecofin.turnoverYear || new Date().getFullYear() - 1,
                        employees: employeesCount,
                        balanceSheetDate: ecofin.balanceSheetDate || null,
                        turnover: turnoverVal,
                        netWorth: ecofin.netWorth ?? null,
                        shareCapital: ecofin.shareCapital ?? null,
                        totalStaffCost: null,
                        avgGrossSalary: null
                    }
                },
                ecofin: item.ecofin,
                employees: item.employees,
                operatingResults: item.operatingResults,
                innovativeSmeAndSu: item.innovativeSmeAndSu
            };
        }
        // Caso 2: Schema /IT-advanced o /IT-start
        return {
            id: item.id,
            vatCode: item.vatCode || fallbackVat,
            taxCode: item.taxCode || item.vatCode || fallbackVat,
            companyName: item.companyName || 'Azienda Sconosciuta',
            activityStatus: item.activityStatus || 'ATTIVA',
            reaCode: item.reaCode,
            cciaa: item.cciaa,
            pec: item.pec,
            sdiCode: item.sdiCode,
            startDate: item.startDate,
            registrationDate: item.registrationDate,
            detailedLegalForm: item.detailedLegalForm,
            address: item.address,
            atecoClassification: item.atecoClassification,
            balanceSheets: item.balanceSheets,
            operatingResults: item.operatingResults,
            innovativeSmeAndSu: item.innovativeSmeAndSu
        };
    }
}
OpenApiClientService.STORAGE_KEY = 'simulatore_costo_openapi_settings_v1';
// ============================================================================
// MOTORE DI CALCOLO COSTO AZIENDALE DIPENDENTE VS PARTITA IVA
// ============================================================================
class CostSimulationEngine {
    /**
     * Calcola l'IRPEF lorda progressiva a scaglioni
     */
    static computeGrossIrpef(taxableIncome) {
        if (taxableIncome <= 0)
            return 0;
        let totalTax = 0;
        for (const bracket of APP_CONFIG.FISCAL.IRPEF_BRACKETS) {
            if (taxableIncome > bracket.min) {
                const upper = bracket.max !== null ? Math.min(taxableIncome, bracket.max) : taxableIncome;
                const slice = Math.max(0, upper - bracket.min);
                totalTax += slice * bracket.rate;
            }
        }
        return totalTax;
    }
    /**
     * Calcola la detrazione per redditi di lavoro dipendente (Art. 13 TUIR 2025/2026)
     */
    static computeEmployeeTaxCredit(taxableIncome) {
        if (taxableIncome <= 0)
            return 0;
        if (taxableIncome <= 15000) {
            return 1955;
        }
        if (taxableIncome <= 28000) {
            const ratio = (28000 - taxableIncome) / 13000;
            const base = 1910 + 1190 * ratio;
            // Maggiorazione 65€ per redditi tra 25.000 e 28.000
            const bonus = taxableIncome >= 25000 ? 65 : 0;
            return base + bonus;
        }
        if (taxableIncome <= 50000) {
            const ratio = (50000 - taxableIncome) / 22000;
            const base = 1910 * ratio;
            const bonus = taxableIncome <= 35000 ? 65 : 0;
            return base + bonus;
        }
        return 0;
    }
    /**
     * Calcola il beneficio del Taglio del Cuneo Fiscale (L. Bilancio 2025/2026):
     * - Fino a 20.000 €: indennità esente (7,1% fino a 8.500€, 5,3% tra 8.500 e 15.000€, 4,8% tra 15.000 e 20.000€)
     * - Tra 20.000 € e 32.000 €: ulteriore detrazione fiscale di 1.000 €
     * - Tra 32.000 € e 40.000 €: ulteriore detrazione decrescente da 1.000 € a 0 €
     */
    static computeCuneoFiscaleBenefit(taxableIncome) {
        if (taxableIncome <= 0)
            return 0;
        if (taxableIncome <= 8500) {
            return taxableIncome * 0.071;
        }
        if (taxableIncome <= 15000) {
            return taxableIncome * 0.053;
        }
        if (taxableIncome <= 20000) {
            return taxableIncome * 0.048;
        }
        if (taxableIncome <= 32000) {
            return 1000;
        }
        if (taxableIncome <= 40000) {
            return 1000 * ((40000 - taxableIncome) / 8000);
        }
        return 0;
    }
    /**
     * Calcola l'aliquota FIS / CIGS in base al numero di dipendenti dell'azienda
     */
    static getCompanySizeFisRate(employeesCount) {
        const surcharges = APP_CONFIG.FISCAL.COMPANY_SIZE_SURCHARGES;
        if (employeesCount <= surcharges.MICRO_1_5.maxEmployees) {
            return { fisRate: surcharges.MICRO_1_5.fisRate, label: I18N.t('fis.MICRO_1_5') };
        }
        if (employeesCount <= surcharges.SMALL_6_15.maxEmployees) {
            return { fisRate: surcharges.SMALL_6_15.fisRate, label: I18N.t('fis.SMALL_6_15') };
        }
        if (employeesCount <= surcharges.MEDIUM_16_50.maxEmployees) {
            return { fisRate: surcharges.MEDIUM_16_50.fisRate, label: I18N.t('fis.MEDIUM_16_50') };
        }
        return { fisRate: surcharges.LARGE_OVER_50.fisRate, label: I18N.t('fis.LARGE_OVER_50') };
    }
    /**
     * Calcola il breakdown completo del Dipendente per una data RAL
     */
    static calculateEmployee(ral, state) {
        const safeRal = Math.max(0, ral);
        const sector = APP_CONFIG.FISCAL.SECTORS.find((s) => s.id === state.sectorId) || APP_CONFIG.FISCAL.SECTORS[0];
        const region = APP_CONFIG.FISCAL.REGIONS[state.regionCode] || APP_CONFIG.FISCAL.REGIONS['12'];
        const qualification = APP_CONFIG.FISCAL.QUALIFICATIONS[state.qualificationKey] ||
            APP_CONFIG.FISCAL.QUALIFICATIONS.IMPIEGATO;
        const incentive = APP_CONFIG.FISCAL.HIRING_INCENTIVES.find((h) => h.id === state.hiringIncentiveId) ||
            APP_CONFIG.FISCAL.HIRING_INCENTIVES[0];
        const sizeInfo = this.getCompanySizeFisRate(state.companyEmployeesCount);
        // Contributo addizionale NASpI 1,40% per contratti a tempo determinato
        const fixedTermSurcharge = state.contractType === 'DETERMINATO' ? 1.40 : 0.0;
        // Aliquota INPS datore di lavoro
        const autoInpsEmployerRate = Math.max(5.0, sector.inpsEmployerBaseRate + sizeInfo.fisRate + qualification.employerRateDelta + fixedTermSurcharge);
        const inpsEmployerRatePct = state.inpsEmployerCustomRate !== null ? state.inpsEmployerCustomRate : autoInpsEmployerRate;
        const inpsEmployerGross = safeRal * (inpsEmployerRatePct / 100);
        // Calcolo sgravio contributivo INPS se selezionata agevolazione
        let inpsEmployerDiscount = 0;
        if (incentive.employerInpsDiscountPct > 0) {
            const rawDiscount = inpsEmployerGross * (incentive.employerInpsDiscountPct / 100);
            inpsEmployerDiscount =
                incentive.maxAnnualDiscountEur > 0
                    ? Math.min(rawDiscount, incentive.maxAnnualDiscountEur)
                    : rawDiscount;
        }
        const inpsEmployerNet = Math.max(0, inpsEmployerGross - inpsEmployerDiscount);
        // Premio INAIL
        const inailRatePct = state.inailCustomRate !== null ? state.inailCustomRate : sector.inailDefaultRate;
        const inailEmployer = safeRal * (inailRatePct / 100);
        // TFR: (RAL / 13.5) - (RAL * 0.50%) + Contributo Fondo Garanzia 0.20%
        const tfrAccrual = Math.max(0, safeRal / APP_CONFIG.FISCAL.TFR_DIVISOR -
            safeRal * (APP_CONFIG.FISCAL.TFR_INPS_GUARANTEE_OFFSET / 100));
        const tfrGuaranteeFund = safeRal * (APP_CONFIG.FISCAL.TFR_GUARANTEE_FUND_EMPLOYER / 100);
        // Enti bilaterali + fondi sanitari + buoni pasto + welfare + gestione busta paga
        const bilateralAndHealthFunds = Math.max(sector.bilateralFundsAnnual, qualification.extraFundsAnnual);
        const mealVouchersAnnual = Math.max(0, state.mealVoucherDaily * state.workingDaysYear);
        const welfareAnnual = Math.max(0, state.welfareAnnual);
        const payrollAdminAnnual = Math.max(0, state.payrollAdminAnnual);
        const totalEmployerGrossCost = safeRal +
            inpsEmployerNet +
            inailEmployer +
            tfrAccrual +
            tfrGuaranteeFund +
            bilateralAndHealthFunds +
            mealVouchersAnnual +
            welfareAnnual +
            payrollAdminAnnual;
        // Deduzioni fiscali IRES (24% + eventuale maxideduzione) e IRAP (deducibile al 100% se Tempo Indeterminato)
        const deductibleLaborCost = totalEmployerGrossCost;
        const extraIresMultiplier = 1 + incentive.extraIresDeductionPct / 100;
        const iresDeductionSaving = state.applyIresIrapTaxShield
            ? deductibleLaborCost * extraIresMultiplier * (APP_CONFIG.FISCAL.IRES_RATE / 100)
            : 0;
        // Per i dipendenti a tempo indeterminato il cuneo fiscale è deducibile al 100% dall'IRAP
        const irapDeductionSaving = state.applyIresIrapTaxShield && state.contractType === 'INDETERMINATO'
            ? deductibleLaborCost * (region.irapRate / 100)
            : 0;
        const totalTaxShieldSaving = iresDeductionSaving + irapDeductionSaving;
        const totalEmployerNetCostAfterTax = totalEmployerGrossCost - totalTaxShieldSaving;
        // Calcolo Netto in Busta Paga Dipendente
        // Oltre 15 dipendenti in settori CIGS l'aliquota INPS dipendente aumenta di +0,30% (da 9,19% a 9,49%)
        let inpsEmployeeRatePct = sector.inpsEmployeeBaseRate;
        if (qualification.employeeRateOverride !== undefined) {
            inpsEmployeeRatePct = qualification.employeeRateOverride;
        }
        else if (state.companyEmployeesCount > 15) {
            inpsEmployeeRatePct += 0.30;
        }
        const inpsEmployee = safeRal * (inpsEmployeeRatePct / 100);
        const taxableIrpefIncome = Math.max(0, safeRal - inpsEmployee);
        const irpefGross = this.computeGrossIrpef(taxableIrpefIncome);
        const detrazioneLavoroDipendente = this.computeEmployeeTaxCredit(taxableIrpefIncome);
        const cuneoFiscaleBenefit = this.computeCuneoFiscaleBenefit(taxableIrpefIncome);
        // Per redditi <= 20.000€ il cuneo fiscale è un'indennità esente; tra 20k e 40k è un'ulteriore detrazione
        const isCuneoCashBonus = taxableIrpefIncome <= 20000;
        const extraDetrazioneCuneo = isCuneoCashBonus ? 0 : cuneoFiscaleBenefit;
        const cashBonusCuneo = isCuneoCashBonus ? cuneoFiscaleBenefit : 0;
        const irpefNet = Math.max(0, irpefGross - detrazioneLavoroDipendente - extraDetrazioneCuneo);
        // Trattamento integrativo (ex Bonus Renzi 1.200€) se reddito <= 15.000€ e imposta lorda > detrazione
        const trattamentoIntegrativo = taxableIrpefIncome > 8500 && taxableIrpefIncome <= 15000 && irpefGross > detrazioneLavoroDipendente - 75
            ? 1200
            : 0;
        const addizionaleRegionale = taxableIrpefIncome > 15000 ? taxableIrpefIncome * (region.addRegIrpef / 100) : 0;
        const addizionaleComunale = taxableIrpefIncome > 15000 ? taxableIrpefIncome * (region.addComIrpef / 100) : 0;
        const netAnnualCash = Math.max(0, taxableIrpefIncome -
            irpefNet -
            addizionaleRegionale -
            addizionaleComunale +
            cashBonusCuneo +
            trattamentoIntegrativo);
        const totalWorkerTaxesAndContributions = Math.max(0, safeRal - netAnnualCash);
        const netMonthlyCash = state.mensilita > 0 ? netAnnualCash / state.mensilita : netAnnualCash / 12;
        const netAnnualWithBenefits = netAnnualCash + mealVouchersAnnual + welfareAnnual;
        const netAnnualTotalWithTfr = netAnnualWithBenefits + tfrAccrual;
        const effectiveBenefitForWedge = state.includeTfrInWorkerBenefit
            ? netAnnualTotalWithTfr
            : netAnnualWithBenefits;
        const taxWedgeTotalEur = Math.max(0, totalEmployerGrossCost - effectiveBenefitForWedge);
        const taxWedgePct = totalEmployerGrossCost > 0 ? (taxWedgeTotalEur / totalEmployerGrossCost) * 100 : 0;
        const workDays = Math.max(1, state.workingDaysYear);
        return {
            ral: safeRal,
            mensilita: state.mensilita,
            grossMonthly: state.mensilita > 0 ? safeRal / state.mensilita : safeRal / 12,
            inpsEmployerRatePct,
            inpsEmployerGross,
            inpsEmployerDiscount,
            inpsEmployerNet,
            inailRatePct,
            inailEmployer,
            tfrAccrual,
            tfrGuaranteeFund,
            bilateralAndHealthFunds,
            mealVouchersAnnual,
            welfareAnnual,
            payrollAdminAnnual,
            totalEmployerGrossCost,
            totalEmployerMonthlyGrossCost: totalEmployerGrossCost / 12,
            iresDeductionSaving,
            irapDeductionSaving,
            totalTaxShieldSaving,
            totalEmployerNetCostAfterTax,
            inpsEmployeeRatePct,
            inpsEmployee,
            taxableIrpefIncome,
            irpefGross,
            detrazioneLavoroDipendente,
            cuneoFiscaleBenefit,
            trattamentoIntegrativo,
            irpefNet,
            addizionaleRegionale,
            addizionaleComunale,
            totalWorkerTaxesAndContributions,
            netAnnualCash,
            netMonthlyCash,
            netAnnualWithBenefits,
            netAnnualTotalWithTfr,
            effectiveCostMultiplier: safeRal > 0 ? totalEmployerGrossCost / safeRal : 0,
            taxWedgeTotalEur,
            taxWedgePct,
            dailyEmployerCost: totalEmployerGrossCost / workDays,
            hourlyEmployerCost: totalEmployerGrossCost / (workDays * 8)
        };
    }
    /**
     * Calcola il breakdown completo del Professionista a Partita IVA per un dato compenso base annuo
     */
    static calculatePiva(baseCompensation, state) {
        const safeComp = Math.max(0, baseCompensation);
        const region = APP_CONFIG.FISCAL.REGIONS[state.regionCode] || APP_CONFIG.FISCAL.REGIONS['12'];
        const cassa = APP_CONFIG.FISCAL.CASSE_PREVIDENZIALI.find((c) => c.id === state.cassaId) ||
            APP_CONFIG.FISCAL.CASSE_PREVIDENZIALI[0];
        const requestedIsForfettario = state.pivaRegime === 'FORFETTARIO_5' || state.pivaRegime === 'FORFETTARIO_15';
        // Rivalsa INPS 4% (se Gestione Separata e selezionata) oppure Contributo Integrativo Cassa (es. 4% Inarcassa)
        let rivalsaOrIntegrativeRatePct = 0;
        if (cassa.id === 'GESTIONE_SEPARATA') {
            rivalsaOrIntegrativeRatePct = state.applyRivalsaInps ? cassa.integrativeRate : 0;
        }
        else {
            rivalsaOrIntegrativeRatePct = cassa.integrativeRate;
        }
        const rivalsaOrIntegrativeAmount = safeComp * (rivalsaOrIntegrativeRatePct / 100);
        const totalInvoiceTaxable = safeComp + rivalsaOrIntegrativeAmount;
        // Verifica superamento soglia Regime Forfettario (85.000 € vigente o 100.000 € ipotesi riforma)
        // Concorre alla soglia anche la Rivalsa INPS 4% addebitata in fattura
        const threshold = state.forfettarioThreshold || APP_CONFIG.FISCAL.FORFETTARIO_LIMIT_CURRENT;
        const isAutoSwitchedToOrdinario = requestedIsForfettario &&
            state.autoSwitchToOrdinarioOverThreshold &&
            totalInvoiceTaxable > threshold;
        const effectiveRegime = isAutoSwitchedToOrdinario
            ? 'ORDINARIO'
            : state.pivaRegime;
        const isForfettario = effectiveRegime === 'FORFETTARIO_5' || effectiveRegime === 'FORFETTARIO_15';
        // 12 fatture annue con marca da bollo da 2,00 € (solo se effettivamente in regime forfettario esente IVA)
        const stampDutyAnnual = isForfettario && safeComp > 0 ? APP_CONFIG.FISCAL.STAMP_DUTY_INVOICE * 12 : 0;
        // IVA: 0% nel forfettario, 22% nell'ordinario
        const vatRatePct = isForfettario ? 0 : APP_CONFIG.FISCAL.STANDARD_VAT_RATE;
        const vatAmount = totalInvoiceTaxable * (vatRatePct / 100);
        const totalInvoiceGrossWithVat = totalInvoiceTaxable + vatAmount + stampDutyAnnual;
        // Se l'azienda ha pro-rata di indetraibilità IVA (es. banche, assicurazioni, sanità), l'IVA non detraibile diventa un costo aziendale!
        const nonDeductibleVatShare = Math.max(0, 100 - state.vatDeductibilityPct) / 100;
        const nonDeductibleVatCost = vatAmount * nonDeductibleVatShare;
        const totalCompanyGrossCost = totalInvoiceTaxable + stampDutyAnnual + nonDeductibleVatCost;
        // Deduzione IRES (24%) + IRAP regionale (i costi per servizi P.IVA in B7 sono deducibili sia da IRES sia da IRAP)
        const iresDeductionSaving = state.applyIresIrapTaxShield
            ? totalCompanyGrossCost * (APP_CONFIG.FISCAL.IRES_RATE / 100)
            : 0;
        const irapDeductionSaving = state.applyIresIrapTaxShield
            ? totalCompanyGrossCost * (region.irapRate / 100)
            : 0;
        const totalTaxShieldSaving = iresDeductionSaving + irapDeductionSaving;
        const totalCompanyNetCostAfterTax = totalCompanyGrossCost - totalTaxShieldSaving;
        // Calcolo Reddito Imponibile, Contributi e Imposte del Professionista
        const realProfessionalExpenses = Math.max(0, state.pivaDeductibleExpenses);
        // Per la Gestione Separata la Rivalsa 4% fa parte del compenso imponibile; per le Casse di Ordine il 4% integrativo non è reddito imponibile
        const revenueSubjectToCoeff = cassa.integrativeIsTaxable
            ? safeComp + rivalsaOrIntegrativeAmount + stampDutyAnnual
            : safeComp;
        let taxableRevenueForContributions = 0;
        if (isForfettario) {
            taxableRevenueForContributions = revenueSubjectToCoeff * (state.forfettarioCoeff / 100);
        }
        else {
            taxableRevenueForContributions = Math.max(0, revenueSubjectToCoeff - realProfessionalExpenses);
        }
        // Calcolo Contributi Previdenziali Cassa / INPS
        let cassaContributions = 0;
        if (cassa.id === 'INPS_ARTIGIANI_COMMERCIANTI') {
            if (taxableRevenueForContributions > 0) {
                const excess = Math.max(0, taxableRevenueForContributions - cassa.fixedThresholdIncome);
                const rawContrib = cassa.fixedMinimumAnnual + excess * (cassa.subjectiveRate / 100);
                cassaContributions =
                    isForfettario && state.applyArtigianiDiscount35 ? rawContrib * 0.65 : rawContrib;
            }
        }
        else if (cassa.id === 'CASSA_ORDINE_PROFESSIONALE') {
            if (taxableRevenueForContributions > 0) {
                const propContrib = taxableRevenueForContributions * (cassa.subjectiveRate / 100);
                cassaContributions = Math.max(cassa.fixedMinimumAnnual, propContrib);
            }
        }
        else {
            // Gestione Separata INPS
            cassaContributions = taxableRevenueForContributions * (cassa.subjectiveRate / 100);
        }
        // Reddito imponibile fiscale al netto dei contributi previdenziali
        const taxableIncomeForTax = Math.max(0, taxableRevenueForContributions - cassaContributions);
        let incomeTaxAmount = 0;
        if (effectiveRegime === 'FORFETTARIO_5') {
            incomeTaxAmount = taxableIncomeForTax * 0.05;
        }
        else if (effectiveRegime === 'FORFETTARIO_15') {
            incomeTaxAmount = taxableIncomeForTax * 0.15;
        }
        else {
            // Regime Ordinario IRPEF + Addizionali Regionali e Comunali
            const irpefGross = this.computeGrossIrpef(taxableIncomeForTax);
            // Detrazione lavoro autonomo (Art. 13 c. 5 TUIR: 1.265€ fino a 5.500€, decrescente fino a 50.000€)
            let autonomoCredit = 0;
            if (taxableIncomeForTax <= 5500) {
                autonomoCredit = 1265;
            }
            else if (taxableIncomeForTax <= 28000) {
                autonomoCredit = 500 + 765 * ((28000 - taxableIncomeForTax) / 22500);
            }
            else if (taxableIncomeForTax <= 50000) {
                autonomoCredit = 500 * ((50000 - taxableIncomeForTax) / 22000);
            }
            const irpefNet = Math.max(0, irpefGross - autonomoCredit);
            const addReg = taxableIncomeForTax > 15000 ? taxableIncomeForTax * (region.addRegIrpef / 100) : 0;
            const addCom = taxableIncomeForTax > 15000 ? taxableIncomeForTax * (region.addComIrpef / 100) : 0;
            incomeTaxAmount = irpefNet + addReg + addCom;
        }
        // Incasso netto effettivo del professionista (al netto di imposte, contributi e spese reali di gestione)
        const grossCashCollectedExVat = cassa.integrativeIsTaxable
            ? safeComp + rivalsaOrIntegrativeAmount + stampDutyAnnual
            : safeComp + stampDutyAnnual;
        const netAnnualCash = Math.max(0, grossCashCollectedExVat - cassaContributions - incomeTaxAmount - realProfessionalExpenses);
        const totalFiscalBurden = cassaContributions + incomeTaxAmount;
        const effectiveTaxAndContribRatePct = grossCashCollectedExVat > 0 ? (totalFiscalBurden / grossCashCollectedExVat) * 100 : 0;
        const taxWedgeTotalEur = Math.max(0, totalCompanyGrossCost - netAnnualCash);
        const taxWedgePct = totalCompanyGrossCost > 0 ? (taxWedgeTotalEur / totalCompanyGrossCost) * 100 : 0;
        const billedDays = Math.max(1, state.pivaBilledDaysYear);
        return {
            baseCompensation: safeComp,
            requestedRegime: state.pivaRegime,
            effectiveRegime,
            isAutoSwitchedToOrdinario,
            forfettarioThresholdUsed: threshold,
            rivalsaOrIntegrativeRatePct,
            rivalsaOrIntegrativeAmount,
            stampDutyAnnual,
            totalInvoiceTaxable,
            vatRatePct,
            vatAmount,
            totalInvoiceGrossWithVat,
            nonDeductibleVatCost,
            totalCompanyGrossCost,
            totalCompanyMonthlyGrossCost: totalCompanyGrossCost / 12,
            iresDeductionSaving,
            irapDeductionSaving,
            totalTaxShieldSaving,
            totalCompanyNetCostAfterTax,
            taxableRevenueForContributions,
            cassaContributions,
            taxableIncomeForTax,
            incomeTaxAmount,
            effectiveTaxAndContribRatePct,
            realProfessionalExpenses,
            netAnnualCash,
            netMonthlyCash: netAnnualCash / 12,
            effectiveCostMultiplier: safeComp > 0 ? totalCompanyGrossCost / safeComp : 0,
            taxWedgeTotalEur,
            taxWedgePct,
            impliedDailyRate: safeComp / billedDays,
            impliedHourlyRate: safeComp / (billedDays * 8)
        };
    }
    /**
     * Ricerca binaria inversa per trovare la RAL Dipendente che produce un determinato Target (Netto o Costo Azienda)
     */
    static solveEmployeeRalForTarget(target, targetType, state) {
        let low = 0;
        let high = Math.max(500000, target * 3.5);
        for (let i = 0; i < 48; i++) {
            const mid = (low + high) / 2;
            const res = this.calculateEmployee(mid, state);
            const val = targetType === 'WORKER_NET'
                ? state.includeTfrInWorkerBenefit
                    ? res.netAnnualTotalWithTfr
                    : res.netAnnualWithBenefits
                : res.totalEmployerGrossCost;
            if (val < target) {
                low = mid;
            }
            else {
                high = mid;
            }
        }
        return Math.round((low + high) / 2);
    }
    /**
     * Ricerca binaria inversa (a tratti monotoni) per trovare il Compenso Base P.IVA che produce
     * un determinato Target (Netto o Costo Azienda), gestendo lo "scalino fiscale" (tax cliff)
     * del passaggio automatico da Regime Forfettario a Regime Ordinario oltre 85.000 € / 100.000 €.
     */
    static solvePivaBaseForTarget(target, targetType, state) {
        const requestedIsForfettario = state.pivaRegime === 'FORFETTARIO_5' || state.pivaRegime === 'FORFETTARIO_15';
        // Se è attivo lo switch automatico oltre soglia Forfettario, dividiamo la ricerca nei due rami monotoni
        if (requestedIsForfettario && state.autoSwitchToOrdinarioOverThreshold) {
            const cassa = APP_CONFIG.FISCAL.CASSE_PREVIDENZIALI.find((c) => c.id === state.cassaId) ||
                APP_CONFIG.FISCAL.CASSE_PREVIDENZIALI[0];
            const rivalsaRate = cassa.id === 'GESTIONE_SEPARATA'
                ? state.applyRivalsaInps
                    ? cassa.integrativeRate
                    : 0
                : cassa.integrativeRate;
            const threshold = state.forfettarioThreshold || APP_CONFIG.FISCAL.FORFETTARIO_LIMIT_CURRENT;
            const maxForfettarioBase = Math.floor(threshold / (1 + rivalsaRate / 100));
            const resAtMaxForfettario = this.calculatePiva(maxForfettarioBase, state);
            const valAtMaxForfettario = targetType === 'WORKER_NET'
                ? resAtMaxForfettario.netAnnualCash
                : resAtMaxForfettario.totalCompanyGrossCost;
            if (target <= valAtMaxForfettario) {
                // Ramo 1: interamente dentro il Regime Forfettario [0, maxForfettarioBase]
                let low = 0;
                let high = maxForfettarioBase;
                for (let i = 0; i < 48; i++) {
                    const mid = (low + high) / 2;
                    const res = this.calculatePiva(mid, state);
                    const val = targetType === 'WORKER_NET' ? res.netAnnualCash : res.totalCompanyGrossCost;
                    if (val < target) {
                        low = mid;
                    }
                    else {
                        high = mid;
                    }
                }
                return Math.round((low + high) / 2);
            }
            else {
                // Ramo 2: oltre la soglia Forfettario, interamente in Regime Ordinario [maxForfettarioBase + 1, max]
                let low = maxForfettarioBase + 1;
                let high = Math.max(500000, target * 3.5);
                for (let i = 0; i < 48; i++) {
                    const mid = (low + high) / 2;
                    const res = this.calculatePiva(mid, state);
                    const val = targetType === 'WORKER_NET' ? res.netAnnualCash : res.totalCompanyGrossCost;
                    if (val < target) {
                        low = mid;
                    }
                    else {
                        high = mid;
                    }
                }
                return Math.round((low + high) / 2);
            }
        }
        let low = 0;
        let high = Math.max(500000, target * 3.5);
        for (let i = 0; i < 48; i++) {
            const mid = (low + high) / 2;
            const res = this.calculatePiva(mid, state);
            const val = targetType === 'WORKER_NET' ? res.netAnnualCash : res.totalCompanyGrossCost;
            if (val < target) {
                low = mid;
            }
            else {
                high = mid;
            }
        }
        return Math.round((low + high) / 2);
    }
    /**
     * Esegue la simulazione comparativa completa
     */
    static runSimulation(state) {
        let effectiveRal = state.employeeRal;
        let effectivePivaBase = state.syncPivaToRal ? state.employeeRal : state.pivaGrossAnnual;
        if (state.mode === 'PARITA_NETTO') {
            effectiveRal = this.solveEmployeeRalForTarget(state.targetValue, 'WORKER_NET', state);
            effectivePivaBase = this.solvePivaBaseForTarget(state.targetValue, 'WORKER_NET', state);
        }
        else if (state.mode === 'PARITA_COSTO_AZIENDA') {
            effectiveRal = this.solveEmployeeRalForTarget(state.targetValue, 'COMPANY_COST', state);
            effectivePivaBase = this.solvePivaBaseForTarget(state.targetValue, 'COMPANY_COST', state);
        }
        const employee = this.calculateEmployee(effectiveRal, state);
        const piva = this.calculatePiva(effectivePivaBase, state);
        // Calcolo Break-Even Points
        const breakEvenPivaBaseForSameCompanyCost = this.solvePivaBaseForTarget(employee.totalEmployerGrossCost, 'COMPANY_COST', state);
        const targetWorkerNetForBreakEven = state.includeTfrInWorkerBenefit
            ? employee.netAnnualTotalWithTfr
            : employee.netAnnualWithBenefits;
        const breakEvenPivaBaseForSameWorkerNet = this.solvePivaBaseForTarget(targetWorkerNetForBreakEven, 'WORKER_NET', state);
        const billedDays = Math.max(1, state.pivaBilledDaysYear);
        // Valutazione normativa rischio monocommittenza / etero-organizzazione (Art. 2 D.Lgs. 81/2015 e L. 81/2017)
        const notes = [];
        let riskScore = 'BASSO';
        const thresholdLabel = formatEuro(piva.forfettarioThresholdUsed);
        if (piva.isAutoSwitchedToOrdinario) {
            riskScore = 'MEDIO';
            notes.push(I18N.t('compliance.note_auto_switch', {
                taxable: formatEuro(piva.totalInvoiceTaxable),
                threshold: thresholdLabel
            }));
        }
        else if ((state.pivaRegime === 'FORFETTARIO_5' || state.pivaRegime === 'FORFETTARIO_15') &&
            piva.totalInvoiceTaxable > piva.forfettarioThresholdUsed) {
            riskScore = 'ALTO';
            notes.push(I18N.t('compliance.note_over_threshold', {
                taxable: formatEuro(piva.totalInvoiceTaxable),
                threshold: thresholdLabel
            }));
        }
        if (state.pivaBilledDaysYear >= 210) {
            riskScore = riskScore === 'ALTO' ? 'ALTO' : 'MEDIO';
            notes.push(I18N.t('compliance.note_days', {
                days: state.pivaBilledDaysYear
            }));
        }
        if (state.cassaId === 'CASSA_ORDINE_PROFESSIONALE') {
            notes.push(I18N.t('compliance.note_ordine'));
        }
        else {
            notes.push(I18N.t('compliance.note_gs'));
        }
        return {
            employee,
            piva,
            companyCostDiffGross: piva.totalCompanyGrossCost - employee.totalEmployerGrossCost,
            companyCostDiffAfterTax: piva.totalCompanyNetCostAfterTax - employee.totalEmployerNetCostAfterTax,
            workerNetDiffCash: piva.netAnnualCash - employee.netAnnualWithBenefits,
            workerNetDiffWithTfr: piva.netAnnualCash - employee.netAnnualTotalWithTfr,
            breakEvenPivaBaseForSameCompanyCost,
            breakEvenDailyRateForSameCompanyCost: breakEvenPivaBaseForSameCompanyCost / billedDays,
            breakEvenPivaBaseForSameWorkerNet,
            breakEvenDailyRateForSameWorkerNet: breakEvenPivaBaseForSameWorkerNet / billedDays,
            monocommittenzaRiskScore: riskScore,
            monocommittenzaNotes: notes
        };
    }
}
// ============================================================================
// UTILITY DI FORMATTAZIONE
// ============================================================================
function formatEuro(val, decimals = 0) {
    const locale = typeof I18N !== 'undefined' ? I18N.getLocaleTag() : 'it-IT';
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(Number.isFinite(val) ? val : 0);
}
function formatNumber(val, decimals = 1) {
    const locale = typeof I18N !== 'undefined' ? I18N.getLocaleTag() : 'it-IT';
    return new Intl.NumberFormat(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(Number.isFinite(val) ? val : 0);
}
// ============================================================================
// CONTROLLER UI PRINCIPALE DELL'APPLICAZIONE
// ============================================================================
class SimulatorAppController {
    constructor() {
        this.activeVisura = null;
        this.activeVisuraSource = null;
        this.calibrationLog = [];
        this.apiService = new OpenApiClientService(APP_CONFIG.OPENAPI);
        this.state = {
            mode: 'PARITA_LORDO',
            targetValue: 35000,
            regionCode: '12', // Lazio default
            sectorId: 'TECH_PROFESSIONALS',
            companyEmployeesCount: 14,
            vatDeductibilityPct: 100,
            applyIresIrapTaxShield: true,
            employeeRal: 40000,
            qualificationKey: 'IMPIEGATO',
            contractType: 'INDETERMINATO',
            mensilita: 14,
            inpsEmployerCustomRate: null,
            inailCustomRate: null,
            hiringIncentiveId: 'NONE',
            mealVoucherDaily: 8,
            workingDaysYear: 220,
            welfareAnnual: 500,
            payrollAdminAnnual: 450,
            includeTfrInWorkerBenefit: true,
            pivaGrossAnnual: 40000,
            syncPivaToRal: true,
            pivaRegime: 'FORFETTARIO_15',
            forfettarioThreshold: APP_CONFIG.FISCAL.FORFETTARIO_LIMIT_CURRENT,
            autoSwitchToOrdinarioOverThreshold: true,
            forfettarioCoeff: 78,
            cassaId: 'GESTIONE_SEPARATA',
            applyRivalsaInps: true,
            applyArtigianiDiscount35: false,
            pivaDeductibleExpenses: 1200,
            pivaBilledDaysYear: 220
        };
    }
    async init() {
        await this.apiService.syncApiKeyFromTsSourceIfAvailable();
        const langSelect = document.getElementById('select-language');
        if (langSelect) {
            langSelect.value = I18N.getLang();
        }
        I18N.applyStaticTranslations();
        this.populateDynamicSelects();
        this.bindEvents();
        this.updateApiStatusBadge();
        this.syncInputsFromState();
        this.recalculateAndRender();
    }
    populateDynamicSelects() {
        // Regioni
        const regionSelect = document.getElementById('select-region');
        if (regionSelect) {
            regionSelect.innerHTML = Object.values(APP_CONFIG.FISCAL.REGIONS)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((r) => `<option value="${r.code}">${r.name} (IRAP ${formatNumber(r.irapRate, 2)}% • Add. Reg. ${formatNumber(r.addRegIrpef, 2)}%)</option>`)
                .join('');
        }
        // Settori ATECO / CCNL
        const sectorSelect = document.getElementById('select-sector');
        if (sectorSelect) {
            sectorSelect.innerHTML = APP_CONFIG.FISCAL.SECTORS.map((s) => `<option value="${s.id}">${I18N.t(`sector.${s.id}`)} (INPS ${formatNumber(s.inpsEmployerBaseRate, 2)}% • INAIL ${formatNumber(s.inailDefaultRate, 2)}%)</option>`).join('');
        }
        // Qualifiche
        const qualSelect = document.getElementById('select-qualification');
        if (qualSelect) {
            qualSelect.innerHTML = Object.entries(APP_CONFIG.FISCAL.QUALIFICATIONS)
                .map(([k]) => `<option value="${k}">${I18N.t(`qual.${k}`)}</option>`)
                .join('');
        }
        // Agevolazioni assunzione
        const incSelect = document.getElementById('select-incentive');
        if (incSelect) {
            incSelect.innerHTML = APP_CONFIG.FISCAL.HIRING_INCENTIVES.map((h) => `<option value="${h.id}">${I18N.t(`inc.${h.id}`)}</option>`).join('');
        }
        // Casse Previdenziali P.IVA
        const cassaSelect = document.getElementById('select-cassa');
        if (cassaSelect) {
            cassaSelect.innerHTML = APP_CONFIG.FISCAL.CASSE_PREVIDENZIALI.map((c) => `<option value="${c.id}">${I18N.t(`cassa.${c.id}`)}</option>`).join('');
        }
        // Coefficienti Forfettario
        const coeffSelect = document.getElementById('select-forfettario-coeff');
        if (coeffSelect) {
            coeffSelect.innerHTML = APP_CONFIG.FISCAL.FORFETTARIO_COEFFICIENTS.map((c) => `<option value="${c.coeff}">${I18N.t(`coeff.${c.code}`)}</option>`).join('');
        }
    }
    bindEvents() {
        // Aggiornamento dinamico offset top per sticky section modalità
        const syncHeaderHeight = () => {
            const header = document.querySelector('header');
            if (header) {
                document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`);
            }
        };
        syncHeaderHeight();
        window.addEventListener('resize', syncHeaderHeight);
        // Selettore lingua nell'header
        const langSelect = document.getElementById('select-language');
        langSelect?.addEventListener('change', () => {
            I18N.setLang(langSelect.value);
            I18N.applyStaticTranslations();
            this.populateDynamicSelects();
            this.updateApiStatusBadge();
            this.syncInputsFromState();
            const body = document.getElementById('visura-collapsible-body');
            if (body) {
                this.setVisuraSectionExpanded(!body.classList.contains('hidden'));
            }
            if (this.activeVisura) {
                this.calibrateParametersFromVisura(this.activeVisura);
                this.renderVisuraCard();
            }
            this.recalculateAndRender();
            syncHeaderHeight();
        });
        // Toggle pannello collassabile Visura Openapi.it (Opzionale)
        document.getElementById('btn-toggle-visura-section')?.addEventListener('click', () => {
            this.toggleVisuraSection();
        });
        // Ricerca Partita IVA su Openapi.it
        const formVisura = document.getElementById('form-visura-search');
        formVisura?.addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.getElementById('input-company-vat');
            if (input) {
                this.setVisuraSectionExpanded(true);
                void this.handleVisuraLookup(input.value);
            }
        });
        // Pulsanti rapidi Sandbox Preset P.IVA
        document.querySelectorAll('[data-preset-vat]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const vat = btn.getAttribute('data-preset-vat') || '';
                const input = document.getElementById('input-company-vat');
                if (input)
                    input.value = vat;
                this.setVisuraSectionExpanded(true);
                void this.handleVisuraLookup(vat);
            });
        });
        // Rimozione visura attiva
        document.getElementById('btn-clear-visura')?.addEventListener('click', () => {
            this.activeVisura = null;
            this.activeVisuraSource = null;
            this.calibrationLog = [];
            this.renderVisuraCard();
            this.recalculateAndRender();
        });
        // Applica RAL media da bilancio visura
        document.getElementById('btn-use-visura-salary')?.addEventListener('click', () => {
            const avgSal = this.activeVisura?.balanceSheets?.last?.avgGrossSalary;
            if (avgSal && avgSal > 0) {
                const rounded = Math.round(avgSal / 500) * 500;
                this.state.mode = 'PARITA_LORDO';
                this.state.employeeRal = rounded;
                if (this.state.syncPivaToRal) {
                    this.state.pivaGrossAnnual = rounded;
                }
                this.syncInputsFromState();
                this.recalculateAndRender();
            }
        });
        // Selettore Modalità di Simulazione
        document.querySelectorAll('[data-sim-mode]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const newMode = btn.getAttribute('data-sim-mode');
                if (!newMode)
                    return;
                this.state.mode = newMode;
                if (newMode === 'PARITA_NETTO') {
                    this.state.targetValue = 30000;
                }
                else if (newMode === 'PARITA_COSTO_AZIENDA') {
                    this.state.targetValue = 55000;
                }
                this.syncInputsFromState();
                this.recalculateAndRender();
            });
        });
        // Input numerici e slider sincronizzati
        this.bindNumberInput('input-employee-ral', 'slider-employee-ral', (val) => {
            this.state.employeeRal = val;
            if (this.state.syncPivaToRal) {
                this.state.pivaGrossAnnual = val;
                this.setElementValue('input-piva-gross', val);
                this.setElementValue('slider-piva-gross', val);
            }
        });
        this.bindNumberInput('input-piva-gross', 'slider-piva-gross', (val) => {
            this.state.pivaGrossAnnual = val;
            const syncCheckbox = document.getElementById('check-sync-piva-ral');
            if (syncCheckbox && val !== this.state.employeeRal) {
                this.state.syncPivaToRal = false;
                syncCheckbox.checked = false;
            }
        });
        this.bindNumberInput('input-target-value', 'slider-target-value', (val) => {
            this.state.targetValue = val;
        });
        // Checkbox sync P.IVA = RAL
        const syncCheck = document.getElementById('check-sync-piva-ral');
        syncCheck?.addEventListener('change', () => {
            this.state.syncPivaToRal = syncCheck.checked;
            if (this.state.syncPivaToRal) {
                this.state.pivaGrossAnnual = this.state.employeeRal;
                this.setElementValue('input-piva-gross', this.state.pivaGrossAnnual);
                this.setElementValue('slider-piva-gross', this.state.pivaGrossAnnual);
            }
            this.recalculateAndRender();
        });
        // Altri controlli form
        this.bindSelectOrInput('select-region', (v) => (this.state.regionCode = v));
        this.bindSelectOrInput('select-sector', (v) => {
            this.state.sectorId = v;
            const sec = APP_CONFIG.FISCAL.SECTORS.find((s) => s.id === v);
            if (sec) {
                this.state.vatDeductibilityPct = sec.defaultVatDeductibility;
                this.setElementValue('input-vat-deductibility', sec.defaultVatDeductibility);
            }
        });
        this.bindSelectOrInput('input-company-employees', (v) => {
            this.state.companyEmployeesCount = Math.max(1, parseInt(v, 10) || 1);
        });
        this.bindSelectOrInput('input-vat-deductibility', (v) => {
            this.state.vatDeductibilityPct = Math.min(100, Math.max(0, parseFloat(v) || 0));
        });
        const checkTaxShield = document.getElementById('check-tax-shield');
        checkTaxShield?.addEventListener('change', () => {
            this.state.applyIresIrapTaxShield = checkTaxShield.checked;
            this.recalculateAndRender();
        });
        // Controlli Dipendente
        this.bindSelectOrInput('select-qualification', (v) => {
            this.state.qualificationKey = v;
            const q = APP_CONFIG.FISCAL.QUALIFICATIONS[v];
            if (q) {
                this.state.mensilita = q.defaultMensilita;
                this.setElementValue('select-mensilita', q.defaultMensilita);
            }
        });
        this.bindSelectOrInput('select-contract-type', (v) => {
            this.state.contractType = v;
        });
        this.bindSelectOrInput('select-mensilita', (v) => {
            this.state.mensilita = parseInt(v, 10) || 13;
        });
        this.bindSelectOrInput('select-incentive', (v) => {
            this.state.hiringIncentiveId = v;
        });
        this.bindSelectOrInput('input-meal-voucher', (v) => {
            this.state.mealVoucherDaily = Math.max(0, parseFloat(v) || 0);
        });
        this.bindSelectOrInput('input-welfare-annual', (v) => {
            this.state.welfareAnnual = Math.max(0, parseFloat(v) || 0);
        });
        this.bindSelectOrInput('input-payroll-admin', (v) => {
            this.state.payrollAdminAnnual = Math.max(0, parseFloat(v) || 0);
        });
        this.bindSelectOrInput('input-working-days', (v) => {
            this.state.workingDaysYear = Math.min(365, Math.max(1, parseInt(v, 10) || 220));
        });
        const checkTfrBenefit = document.getElementById('check-include-tfr');
        checkTfrBenefit?.addEventListener('change', () => {
            this.state.includeTfrInWorkerBenefit = checkTfrBenefit.checked;
            this.recalculateAndRender();
        });
        // Controlli Partita IVA
        this.bindSelectOrInput('select-piva-regime', (v) => {
            this.state.pivaRegime = v;
            this.updatePivaRegimeUiVisibility();
        });
        this.bindSelectOrInput('select-forfettario-threshold', (v) => {
            this.state.forfettarioThreshold = parseInt(v, 10) || APP_CONFIG.FISCAL.FORFETTARIO_LIMIT_CURRENT;
        });
        const checkAutoSwitch = document.getElementById('check-auto-switch-ordinario');
        checkAutoSwitch?.addEventListener('change', () => {
            this.state.autoSwitchToOrdinarioOverThreshold = checkAutoSwitch.checked;
            this.recalculateAndRender();
        });
        this.bindSelectOrInput('select-forfettario-coeff', (v) => {
            this.state.forfettarioCoeff = parseInt(v, 10) || 78;
        });
        this.bindSelectOrInput('select-cassa', (v) => {
            this.state.cassaId = v;
            this.updatePivaRegimeUiVisibility();
        });
        this.bindSelectOrInput('input-piva-expenses', (v) => {
            this.state.pivaDeductibleExpenses = Math.max(0, parseFloat(v) || 0);
        });
        this.bindSelectOrInput('input-piva-days', (v) => {
            this.state.pivaBilledDaysYear = Math.min(365, Math.max(1, parseInt(v, 10) || 220));
        });
        const checkRivalsa = document.getElementById('check-rivalsa-inps');
        checkRivalsa?.addEventListener('change', () => {
            this.state.applyRivalsaInps = checkRivalsa.checked;
            this.recalculateAndRender();
        });
        // Pulsante applica Break-even P.IVA
        document.getElementById('btn-apply-breakeven-cost')?.addEventListener('click', () => {
            const sim = CostSimulationEngine.runSimulation(this.state);
            this.state.mode = 'PARITA_LORDO';
            this.state.syncPivaToRal = false;
            this.state.pivaGrossAnnual = sim.breakEvenPivaBaseForSameCompanyCost;
            this.syncInputsFromState();
            this.recalculateAndRender();
        });
        document.getElementById('btn-apply-breakeven-net')?.addEventListener('click', () => {
            const sim = CostSimulationEngine.runSimulation(this.state);
            this.state.mode = 'PARITA_LORDO';
            this.state.syncPivaToRal = false;
            this.state.pivaGrossAnnual = sim.breakEvenPivaBaseForSameWorkerNet;
            this.syncInputsFromState();
            this.recalculateAndRender();
        });
        // Modale Configurazione API Openapi.it
        document.getElementById('btn-open-api-modal')?.addEventListener('click', () => {
            this.openApiSettingsModal();
        });
        document.getElementById('btn-close-api-modal')?.addEventListener('click', () => {
            this.closeApiSettingsModal();
        });
        document.getElementById('form-api-settings')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveApiSettingsFromModal();
        });
        document.getElementById('btn-clear-api-token')?.addEventListener('click', () => {
            this.apiService.clearSavedSettings();
            this.openApiSettingsModal();
            this.updateApiStatusBadge();
        });
        // Stampa / Esporta PDF e JSON
        document.getElementById('btn-print-report')?.addEventListener('click', () => {
            window.print();
        });
        document.getElementById('btn-export-json')?.addEventListener('click', () => {
            this.exportSimulationJson();
        });
    }
    bindNumberInput(inputId, sliderId, onChange) {
        const numEl = document.getElementById(inputId);
        const sliderEl = document.getElementById(sliderId);
        numEl?.addEventListener('input', () => {
            const val = Math.max(0, parseFloat(numEl.value) || 0);
            if (sliderEl)
                sliderEl.value = String(val);
            onChange(val);
            this.recalculateAndRender();
        });
        sliderEl?.addEventListener('input', () => {
            const val = Math.max(0, parseFloat(sliderEl.value) || 0);
            if (numEl)
                numEl.value = String(val);
            onChange(val);
            this.recalculateAndRender();
        });
    }
    bindSelectOrInput(id, onChange) {
        const el = document.getElementById(id);
        el?.addEventListener('input', () => {
            onChange(el.value);
            this.recalculateAndRender();
        });
        el?.addEventListener('change', () => {
            onChange(el.value);
            this.recalculateAndRender();
        });
    }
    setElementValue(id, value) {
        const el = document.getElementById(id);
        if (el)
            el.value = String(value);
    }
    syncInputsFromState() {
        // Aggiorna tab modalità
        document.querySelectorAll('[data-sim-mode]').forEach((btn) => {
            const m = btn.getAttribute('data-sim-mode');
            if (m === this.state.mode) {
                btn.className =
                    'sim-mode-btn w-full px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-center transition-all bg-indigo-600 text-white shadow-sm cursor-pointer';
            }
            else {
                btn.className =
                    'sim-mode-btn w-full px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-center transition-all bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer';
            }
        });
        const targetBox = document.getElementById('box-target-mode');
        const directInputsNote = document.getElementById('note-inverse-mode');
        const targetLabel = document.getElementById('label-target-value');
        if (this.state.mode === 'PARITA_LORDO') {
            targetBox?.classList.add('hidden');
            directInputsNote?.classList.add('hidden');
        }
        else {
            targetBox?.classList.remove('hidden');
            directInputsNote?.classList.remove('hidden');
            if (targetLabel) {
                targetLabel.textContent =
                    this.state.mode === 'PARITA_NETTO'
                        ? I18N.t('sim_mode.target_net_label')
                        : I18N.t('sim_mode.target_cost_label');
            }
        }
        this.setElementValue('input-target-value', this.state.targetValue);
        this.setElementValue('slider-target-value', this.state.targetValue);
        this.setElementValue('input-employee-ral', this.state.employeeRal);
        this.setElementValue('slider-employee-ral', this.state.employeeRal);
        this.setElementValue('input-piva-gross', this.state.pivaGrossAnnual);
        this.setElementValue('slider-piva-gross', this.state.pivaGrossAnnual);
        const syncCheck = document.getElementById('check-sync-piva-ral');
        if (syncCheck)
            syncCheck.checked = this.state.syncPivaToRal;
        this.setElementValue('select-region', this.state.regionCode);
        this.setElementValue('select-sector', this.state.sectorId);
        this.setElementValue('input-company-employees', this.state.companyEmployeesCount);
        this.setElementValue('input-vat-deductibility', this.state.vatDeductibilityPct);
        const checkShield = document.getElementById('check-tax-shield');
        if (checkShield)
            checkShield.checked = this.state.applyIresIrapTaxShield;
        this.setElementValue('select-qualification', this.state.qualificationKey);
        this.setElementValue('select-contract-type', this.state.contractType);
        this.setElementValue('select-mensilita', this.state.mensilita);
        this.setElementValue('select-incentive', this.state.hiringIncentiveId);
        this.setElementValue('input-meal-voucher', this.state.mealVoucherDaily);
        this.setElementValue('input-welfare-annual', this.state.welfareAnnual);
        this.setElementValue('input-payroll-admin', this.state.payrollAdminAnnual);
        this.setElementValue('input-working-days', this.state.workingDaysYear);
        const checkTfr = document.getElementById('check-include-tfr');
        if (checkTfr)
            checkTfr.checked = this.state.includeTfrInWorkerBenefit;
        this.setElementValue('select-piva-regime', this.state.pivaRegime);
        this.setElementValue('select-forfettario-threshold', this.state.forfettarioThreshold);
        const checkAutoOrd = document.getElementById('check-auto-switch-ordinario');
        if (checkAutoOrd)
            checkAutoOrd.checked = this.state.autoSwitchToOrdinarioOverThreshold;
        this.setElementValue('select-forfettario-coeff', this.state.forfettarioCoeff);
        this.setElementValue('select-cassa', this.state.cassaId);
        this.setElementValue('input-piva-expenses', this.state.pivaDeductibleExpenses);
        this.setElementValue('input-piva-days', this.state.pivaBilledDaysYear);
        const checkRivalsa = document.getElementById('check-rivalsa-inps');
        if (checkRivalsa)
            checkRivalsa.checked = this.state.applyRivalsaInps;
        this.updatePivaRegimeUiVisibility();
    }
    updatePivaRegimeUiVisibility() {
        const isForfettario = this.state.pivaRegime === 'FORFETTARIO_5' || this.state.pivaRegime === 'FORFETTARIO_15';
        const coeffWrapper = document.getElementById('wrapper-forfettario-coeff');
        if (coeffWrapper) {
            coeffWrapper.style.opacity = isForfettario ? '1' : '0.45';
        }
        const thresholdWrapper = document.getElementById('wrapper-forfettario-threshold');
        if (thresholdWrapper) {
            thresholdWrapper.style.display = isForfettario ? 'block' : 'none';
        }
        const rivalsaWrapper = document.getElementById('wrapper-rivalsa-inps');
        if (rivalsaWrapper) {
            rivalsaWrapper.style.display = this.state.cassaId === 'GESTIONE_SEPARATA' ? 'flex' : 'none';
        }
    }
    toggleVisuraSection() {
        const body = document.getElementById('visura-collapsible-body');
        if (!body)
            return;
        const isHidden = body.classList.contains('hidden');
        this.setVisuraSectionExpanded(isHidden);
    }
    setVisuraSectionExpanded(expanded) {
        const body = document.getElementById('visura-collapsible-body');
        const chevron = document.getElementById('visura-chevron-icon');
        const toggleLabel = document.getElementById('visura-toggle-label');
        if (!body)
            return;
        if (expanded) {
            body.classList.remove('hidden');
            chevron?.classList.add('rotate-180');
            if (toggleLabel)
                toggleLabel.textContent = I18N.t('visura.toggle_collapse');
        }
        else {
            body.classList.add('hidden');
            chevron?.classList.remove('rotate-180');
            if (toggleLabel)
                toggleLabel.textContent = I18N.t('visura.toggle_expand');
        }
    }
    /**
     * Ricerca e calibrazione automatica da Visura Camerale Openapi.it
     */
    async handleVisuraLookup(vatCode) {
        const statusEl = document.getElementById('visura-status-msg');
        const btnSearch = document.getElementById('btn-search-visura');
        const endpointSelect = document.getElementById('select-openapi-endpoint');
        const endpoint = endpointSelect?.value || '/IT-advanced';
        if (statusEl) {
            statusEl.className = 'mt-2 text-xs font-medium text-indigo-600 flex items-center gap-1.5';
            statusEl.innerHTML = `<span class="inline-block w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span> ${I18N.t('visura.loading', { endpoint })}`;
        }
        if (btnSearch)
            btnSearch.disabled = true;
        try {
            const result = await this.apiService.fetchCompanyVisura(vatCode, endpoint);
            this.activeVisura = result.visura;
            this.activeVisuraSource = result.source;
            this.calibrateParametersFromVisura(result.visura);
            if (statusEl) {
                statusEl.className = 'mt-2 text-xs font-medium text-emerald-700';
                statusEl.textContent = I18N.t('visura.loaded_ok', {
                    name: result.visura.companyName,
                    vat: result.visura.vatCode
                });
            }
            this.syncInputsFromState();
            this.renderVisuraCard();
            this.recalculateAndRender();
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (statusEl) {
                statusEl.className = 'mt-2 text-xs font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2.5';
                statusEl.textContent = `⚠ ${msg}`;
            }
        }
        finally {
            if (btnSearch)
                btnSearch.disabled = false;
        }
    }
    /**
     * Calibra automaticamente Regione (IRAP/Addizionali), Settore ATECO (INPS/INAIL/IVA)
     * e Dimensione Aziendale (FIS/CIGS) partendo dai dati estratti dalla visura Openapi.it
     */
    calibrateParametersFromVisura(visura) {
        const logs = [];
        // 1. Calibrazione Regione (IRAP e Addizionali IRPEF)
        const regObj = visura.address?.registeredOffice?.region;
        if (regObj?.code && APP_CONFIG.FISCAL.REGIONS[regObj.code]) {
            this.state.regionCode = regObj.code;
            const r = APP_CONFIG.FISCAL.REGIONS[regObj.code];
            logs.push(I18N.t('visura.log_region', {
                name: r.name,
                irap: formatNumber(r.irapRate, 2),
                addReg: formatNumber(r.addRegIrpef, 2)
            }));
        }
        else if (regObj?.description) {
            const found = Object.values(APP_CONFIG.FISCAL.REGIONS).find((r) => r.name.toLowerCase() === regObj.description.toLowerCase());
            if (found) {
                this.state.regionCode = found.code;
                logs.push(I18N.t('visura.log_region', {
                    name: found.name,
                    irap: formatNumber(found.irapRate, 2),
                    addReg: formatNumber(found.addRegIrpef, 2)
                }));
            }
        }
        // 2. Calibrazione Settore CCNL, INPS, INAIL e Detraibilità IVA tramite Codice ATECO
        const atecoRaw = visura.atecoClassification?.ateco?.code ||
            visura.atecoClassification?.ateco2022?.code ||
            visura.atecoClassification?.ateco2007?.code ||
            '';
        const cleanAteco = atecoRaw.replace(/\D/g, '');
        if (cleanAteco.length >= 2) {
            const prefix2 = cleanAteco.substring(0, 2);
            const matchedSector = APP_CONFIG.FISCAL.SECTORS.find((s) => s.atecoPrefixes.includes(prefix2));
            if (matchedSector) {
                this.state.sectorId = matchedSector.id;
                this.state.vatDeductibilityPct = matchedSector.defaultVatDeductibility;
                this.state.forfettarioCoeff = matchedSector.defaultForfettarioCoeff;
                logs.push(I18N.t('visura.log_sector', {
                    ateco: atecoRaw,
                    sector: I18N.t(`sector.${matchedSector.id}`),
                    inps: formatNumber(matchedSector.inpsEmployerBaseRate, 2),
                    inail: formatNumber(matchedSector.inailDefaultRate, 2),
                    vat: matchedSector.defaultVatDeductibility
                }));
            }
        }
        // 3. Calibrazione Numero Dipendenti (Impatti su FIS / CIGS e TFR Tesoreria INPS)
        const empCount = visura.balanceSheets?.last?.employees ??
            visura.employees?.employee ??
            null;
        if (typeof empCount === 'number' && empCount > 0) {
            this.state.companyEmployeesCount = empCount;
            const fisInfo = CostSimulationEngine.getCompanySizeFisRate(empCount);
            logs.push(I18N.t('visura.log_employees', {
                count: empCount,
                fisLabel: fisInfo.label
            }));
        }
        this.calibrationLog = logs;
    }
    renderVisuraCard() {
        const container = document.getElementById('visura-card-container');
        if (!container)
            return;
        if (!this.activeVisura) {
            container.classList.add('hidden');
            return;
        }
        container.classList.remove('hidden');
        const v = this.activeVisura;
        const bs = v.balanceSheets?.last;
        const office = v.address?.registeredOffice;
        const provinceStr = typeof office?.province === 'string'
            ? office.province
            : office?.province?.code || v.cciaa || '';
        const ateco = v.atecoClassification?.ateco ||
            v.atecoClassification?.ateco2022 ||
            v.atecoClassification?.ateco2007;
        this.setText('visura-company-name', v.companyName);
        this.setText('visura-legal-form', v.detailedLegalForm?.description || 'Società di Capitali');
        this.setText('visura-vat-code', `P.IVA ${v.vatCode}`);
        this.setText('visura-rea-code', v.reaCode ? `REA ${v.cciaa || ''}-${v.reaCode}` : `CF ${v.taxCode}`);
        this.setText('visura-status-badge', v.activityStatus || 'ATTIVA');
        const sourceBadge = document.getElementById('visura-source-badge');
        if (sourceBadge) {
            sourceBadge.textContent =
                this.activeVisuraSource === 'LIVE_API'
                    ? `Live API Openapi.it (${this.apiService.getSettings().ENVIRONMENT})`
                    : 'Sandbox OAS Openapi.it';
        }
        this.setText('visura-address', `${office?.streetName || ''} — ${office?.zipCode || ''} ${office?.town || ''} (${provinceStr}) • ${office?.region?.description || ''}`);
        this.setText('visura-ateco', ateco ? `${ateco.code} — ${ateco.description}` : I18N.t('visura.not_specified'));
        this.setText('visura-pec-sdi', `PEC: ${v.pec || 'N/D'} • SDI: ${v.sdiCode || 'N/D'}`);
        this.setText('visura-turnover', bs?.turnover ? `${formatEuro(bs.turnover)} (${bs.year})` : 'N/D');
        this.setText('visura-employees', bs?.employees !== null && bs?.employees !== undefined
            ? I18N.t('visura.units', { count: bs.employees })
            : v.employees?.employee
                ? I18N.t('visura.units', { count: v.employees.employee })
                : 'N/D');
        this.setText('visura-staff-cost', bs?.totalStaffCost ? formatEuro(bs.totalStaffCost) : 'N/D');
        this.setText('visura-avg-salary', bs?.avgGrossSalary ? formatEuro(bs.avgGrossSalary) : 'N/D');
        const btnUseSalary = document.getElementById('btn-use-visura-salary');
        if (btnUseSalary) {
            if (bs?.avgGrossSalary && bs.avgGrossSalary > 0) {
                btnUseSalary.classList.remove('hidden');
                btnUseSalary.textContent = I18N.t('visura.btn_apply_salary', {
                    amount: formatEuro(bs.avgGrossSalary)
                });
            }
            else {
                btnUseSalary.classList.add('hidden');
            }
        }
        const logList = document.getElementById('visura-calibration-list');
        if (logList) {
            logList.innerHTML = this.calibrationLog
                .map((item) => `<li class="flex items-start gap-1.5 text-xs text-slate-700"><span class="text-indigo-600 font-bold">✓</span><span>${item}</span></li>`)
                .join('');
        }
    }
    /**
     * Ricalcola l'intera simulazione e aggiorna tutti i componenti della UI
     */
    recalculateAndRender() {
        const result = CostSimulationEngine.runSimulation(this.state);
        const emp = result.employee;
        const piva = result.piva;
        // Se siamo in modalità inversa (PARITA_NETTO o PARITA_COSTO_AZIENDA), aggiorniamo i campi RAL e Compenso P.IVA calcolati
        if (this.state.mode !== 'PARITA_LORDO') {
            this.setElementValue('input-employee-ral', emp.ral);
            this.setElementValue('slider-employee-ral', emp.ral);
            this.setElementValue('input-piva-gross', piva.baseCompensation);
            this.setElementValue('slider-piva-gross', piva.baseCompensation);
        }
        // Banner avviso passaggio automatico da Forfettario a Regime Ordinario oltre soglia (85k / 100k)
        const switchBanner = document.getElementById('banner-auto-ordinario-switch');
        const switchBannerText = document.getElementById('banner-auto-ordinario-text');
        const pivaRegimeBadge = document.getElementById('badge-piva-active-regime');
        if (switchBanner) {
            if (piva.isAutoSwitchedToOrdinario) {
                switchBanner.classList.remove('hidden');
                if (switchBannerText) {
                    switchBannerText.textContent = I18N.t('card_c.banner_switch_text', {
                        taxable: formatEuro(piva.totalInvoiceTaxable),
                        threshold: formatEuro(piva.forfettarioThresholdUsed)
                    });
                }
            }
            else {
                switchBanner.classList.add('hidden');
            }
        }
        if (pivaRegimeBadge) {
            if (piva.isAutoSwitchedToOrdinario) {
                pivaRegimeBadge.textContent = I18N.t('card_c.badge_ord_over', {
                    threshold: formatNumber(piva.forfettarioThresholdUsed / 1000, 0)
                });
                pivaRegimeBadge.className = 'px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300';
            }
            else if (piva.effectiveRegime === 'FORFETTARIO_5') {
                pivaRegimeBadge.textContent = I18N.t('card_c.badge_forf5');
                pivaRegimeBadge.className = 'px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700';
            }
            else if (piva.effectiveRegime === 'FORFETTARIO_15') {
                pivaRegimeBadge.textContent = I18N.t('card_c.badge_forf15');
                pivaRegimeBadge.className = 'px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700';
            }
            else {
                pivaRegimeBadge.textContent = I18N.t('card_c.badge_ord');
                pivaRegimeBadge.className = 'px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700';
            }
        }
        // 1. KPI Executive Cards
        this.setText('kpi-emp-company-cost', formatEuro(emp.totalEmployerGrossCost));
        this.setText('kpi-emp-company-sub', I18N.t('kpi.emp_sub', {
            monthly: formatEuro(emp.totalEmployerMonthlyGrossCost),
            mult: formatNumber(emp.effectiveCostMultiplier, 2)
        }));
        this.setText('kpi-emp-after-tax', formatEuro(emp.totalEmployerNetCostAfterTax));
        this.setText('kpi-piva-company-cost', formatEuro(piva.totalCompanyGrossCost));
        this.setText('kpi-piva-company-sub', I18N.t('kpi.piva_sub', {
            monthly: formatEuro(piva.totalCompanyMonthlyGrossCost),
            daily: formatEuro(piva.impliedDailyRate)
        }));
        this.setText('kpi-piva-after-tax', formatEuro(piva.totalCompanyNetCostAfterTax));
        // Delta Costo Aziendale
        const diffCost = this.state.applyIresIrapTaxShield
            ? result.companyCostDiffAfterTax
            : result.companyCostDiffGross;
        const absDiffCost = Math.abs(diffCost);
        const diffCard = document.getElementById('card-kpi-saving');
        if (Math.abs(diffCost) < 50) {
            this.setText('kpi-cost-diff-title', I18N.t('kpi.diff_equal_title'));
            this.setText('kpi-cost-diff-val', formatEuro(0));
            this.setText('kpi-cost-diff-sub', I18N.t('kpi.diff_equal_sub'));
            if (diffCard)
                diffCard.className = 'rounded-2xl p-5 bg-slate-800 text-white shadow-sm';
        }
        else if (diffCost < 0) {
            // P.IVA costa meno all'azienda
            this.setText('kpi-cost-diff-title', I18N.t('kpi.diff_piva_saves_title'));
            this.setText('kpi-cost-diff-val', `- ${I18N.t('kpi.per_year', { amount: formatEuro(absDiffCost) })}`);
            const pct = emp.totalEmployerGrossCost > 0 ? (absDiffCost / emp.totalEmployerGrossCost) * 100 : 0;
            this.setText('kpi-cost-diff-sub', I18N.t('kpi.diff_piva_saves_sub', {
                monthly: formatEuro(absDiffCost / 12),
                pct: formatNumber(pct, 1)
            }));
            if (diffCard)
                diffCard.className = 'rounded-2xl p-5 bg-emerald-700 text-white shadow-sm';
        }
        else {
            // Dipendente costa meno all'azienda
            this.setText('kpi-cost-diff-title', I18N.t('kpi.diff_emp_saves_title'));
            this.setText('kpi-cost-diff-val', `- ${I18N.t('kpi.per_year', { amount: formatEuro(absDiffCost) })}`);
            const pct = piva.totalCompanyGrossCost > 0 ? (absDiffCost / piva.totalCompanyGrossCost) * 100 : 0;
            this.setText('kpi-cost-diff-sub', I18N.t('kpi.diff_emp_saves_sub', {
                monthly: formatEuro(absDiffCost / 12),
                pct: formatNumber(pct, 1)
            }));
            if (diffCard)
                diffCard.className = 'rounded-2xl p-5 bg-indigo-700 text-white shadow-sm';
        }
        // Delta Netto Lavoratore
        const empTotalNet = this.state.includeTfrInWorkerBenefit
            ? emp.netAnnualTotalWithTfr
            : emp.netAnnualWithBenefits;
        const netDiff = piva.netAnnualCash - empTotalNet;
        this.setText('kpi-emp-worker-net', formatEuro(empTotalNet));
        this.setText('kpi-emp-worker-net-sub', I18N.t('wedge.emp_net_sub', {
            monthly: formatEuro(emp.netMonthlyCash),
            mens: emp.mensilita
        }));
        this.setText('kpi-piva-worker-net', formatEuro(piva.netAnnualCash));
        this.setText('kpi-piva-worker-net-sub', I18N.t('wedge.piva_net_sub', {
            monthly: formatEuro(piva.netMonthlyCash),
            rate: formatNumber(piva.effectiveTaxAndContribRatePct, 1)
        }));
        const netDiffEl = document.getElementById('kpi-worker-net-diff');
        if (netDiffEl) {
            if (Math.abs(netDiff) < 50) {
                netDiffEl.textContent = I18N.t('wedge.diff_equal');
                netDiffEl.className = 'text-xs font-semibold text-slate-600';
            }
            else if (netDiff > 0) {
                netDiffEl.textContent = I18N.t('wedge.diff_piva', {
                    annual: formatEuro(netDiff),
                    monthly: formatEuro(netDiff / 12)
                });
                netDiffEl.className = 'text-xs font-semibold text-emerald-700';
            }
            else {
                netDiffEl.textContent = I18N.t('wedge.diff_emp', {
                    annual: formatEuro(Math.abs(netDiff)),
                    monthly: formatEuro(Math.abs(netDiff) / 12)
                });
                netDiffEl.className = 'text-xs font-semibold text-indigo-700';
            }
        }
        // 2. Barre di Scomposizione Visiva (Stacked Bars)
        this.renderVisualComparisonBars(emp, piva);
        // 3. Break-Even & Tariffa Giornaliera Equivalente
        this.setText('be-cost-annual', formatEuro(result.breakEvenPivaBaseForSameCompanyCost));
        this.setText('be-cost-daily', I18N.t('be.per_day', { amount: formatEuro(result.breakEvenDailyRateForSameCompanyCost) }));
        this.setText('be-net-annual', formatEuro(result.breakEvenPivaBaseForSameWorkerNet));
        this.setText('be-net-daily', I18N.t('be.per_day', { amount: formatEuro(result.breakEvenDailyRateForSameWorkerNet) }));
        // 4. Tabella Comparativa Analitica Voce per Voce
        this.renderDetailedComparisonTable(emp, piva);
        // 5. Impatto sul Bilancio Aziendale (se c'è una Visura attiva o dati di bilancio)
        this.renderBalanceSheetImpact(emp, piva);
        // 6. Valutazione Rischio Monocommittenza / Normativa
        this.renderComplianceNotes(result);
    }
    renderVisualComparisonBars(emp, piva) {
        const maxTotal = Math.max(emp.totalEmployerGrossCost, piva.totalCompanyGrossCost, 1);
        // Dipendente: Netto Cash + Benefit/TFR vs IRPEF/INPS Lavoratore vs INPS/INAIL/Oneri Azienda
        const empNetBenefit = this.state.includeTfrInWorkerBenefit
            ? emp.netAnnualTotalWithTfr
            : emp.netAnnualWithBenefits;
        const empWorkerTax = emp.totalWorkerTaxesAndContributions;
        const empCompanyContributions = Math.max(0, emp.totalEmployerGrossCost - empNetBenefit - empWorkerTax);
        const empNetPct = (empNetBenefit / maxTotal) * 100;
        const empTaxPct = (empWorkerTax / maxTotal) * 100;
        const empCompPct = (empCompanyContributions / maxTotal) * 100;
        this.setBarWidth('bar-emp-net', empNetPct);
        this.setBarWidth('bar-emp-worker-tax', empTaxPct);
        this.setBarWidth('bar-emp-company-tax', empCompPct);
        this.setText('legend-emp-net', `${formatEuro(empNetBenefit)} (${formatNumber(100 - emp.taxWedgePct, 1)}%)`);
        this.setText('legend-emp-wedge', I18N.t('wedge.wedge_fmt', {
            amount: formatEuro(emp.taxWedgeTotalEur),
            pct: formatNumber(emp.taxWedgePct, 1)
        }));
        // Partita IVA: Netto Professionista vs Imposte+Contributi P.IVA vs Costi/IVA indetraibile/Spese
        const pivaNet = piva.netAnnualCash;
        const pivaTaxes = piva.cassaContributions + piva.incomeTaxAmount;
        const pivaOther = Math.max(0, piva.totalCompanyGrossCost - pivaNet - pivaTaxes);
        const pivaNetPct = (pivaNet / maxTotal) * 100;
        const pivaTaxPct = (pivaTaxes / maxTotal) * 100;
        const pivaOtherPct = (pivaOther / maxTotal) * 100;
        this.setBarWidth('bar-piva-net', pivaNetPct);
        this.setBarWidth('bar-piva-tax', pivaTaxPct);
        this.setBarWidth('bar-piva-other', pivaOtherPct);
        this.setText('legend-piva-net', `${formatEuro(pivaNet)} (${formatNumber(100 - piva.taxWedgePct, 1)}%)`);
        this.setText('legend-piva-wedge', I18N.t('wedge.wedge_fmt', {
            amount: formatEuro(piva.taxWedgeTotalEur),
            pct: formatNumber(piva.taxWedgePct, 1)
        }));
    }
    setBarWidth(id, pct) {
        const el = document.getElementById(id);
        if (el) {
            el.style.width = `${Math.min(100, Math.max(0, pct)).toFixed(2)}%`;
        }
    }
    renderDetailedComparisonTable(emp, piva) {
        const tbody = document.getElementById('comparison-table-body');
        if (!tbody)
            return;
        const rows = [
            {
                category: I18N.t('table.r1_cat'),
                label: I18N.t('table.r1_label'),
                empVal: formatEuro(emp.ral),
                pivaVal: formatEuro(piva.baseCompensation),
                note: I18N.t('table.r1_note', {
                    mens: emp.mensilita,
                    days: this.state.pivaBilledDaysYear
                })
            },
            {
                category: I18N.t('table.r2_cat'),
                label: I18N.t('table.r2_label'),
                empVal: `${formatEuro(emp.inpsEmployerNet)} (${formatNumber(emp.inpsEmployerRatePct, 2)}%)`,
                pivaVal: `${formatEuro(piva.rivalsaOrIntegrativeAmount)} (${formatNumber(piva.rivalsaOrIntegrativeRatePct, 1)}%)`,
                note: emp.inpsEmployerDiscount > 0
                    ? I18N.t('table.r2_note_disc', { disc: formatEuro(emp.inpsEmployerDiscount) })
                    : I18N.t('table.r2_note_std')
            },
            {
                category: I18N.t('table.r3_cat'),
                label: I18N.t('table.r3_label'),
                empVal: formatEuro(emp.inailEmployer + emp.bilateralAndHealthFunds),
                pivaVal: formatEuro(piva.stampDutyAnnual),
                note: I18N.t('table.r3_note', {
                    inailPct: formatNumber(emp.inailRatePct, 2),
                    inailAmt: formatEuro(emp.inailEmployer),
                    fundsAmt: formatEuro(emp.bilateralAndHealthFunds)
                })
            },
            {
                category: I18N.t('table.r4_cat'),
                label: I18N.t('table.r4_label'),
                empVal: formatEuro(emp.tfrAccrual + emp.tfrGuaranteeFund),
                pivaVal: formatEuro(0),
                note: I18N.t('table.r4_note')
            },
            {
                category: I18N.t('table.r5_cat'),
                label: I18N.t('table.r5_label'),
                empVal: formatEuro(emp.mealVouchersAnnual + emp.welfareAnnual + emp.payrollAdminAnnual),
                pivaVal: formatEuro(piva.nonDeductibleVatCost),
                note: piva.nonDeductibleVatCost > 0
                    ? I18N.t('table.r5_note_vat', { vat: formatEuro(piva.nonDeductibleVatCost) })
                    : I18N.t('table.r5_note_std', {
                        meal: formatEuro(emp.mealVouchersAnnual),
                        welfare: formatEuro(emp.welfareAnnual),
                        lul: formatEuro(emp.payrollAdminAnnual)
                    })
            },
            {
                category: I18N.t('table.r6_cat'),
                label: I18N.t('table.r6_label'),
                empVal: formatEuro(emp.totalEmployerGrossCost),
                pivaVal: formatEuro(piva.totalCompanyGrossCost),
                highlight: true,
                note: I18N.t('table.r6_note', {
                    empM: formatEuro(emp.totalEmployerMonthlyGrossCost),
                    pivaM: formatEuro(piva.totalCompanyMonthlyGrossCost)
                })
            },
            {
                category: I18N.t('table.r7_cat'),
                label: I18N.t('table.r7_label'),
                empVal: `- ${formatEuro(emp.totalTaxShieldSaving)}`,
                pivaVal: `- ${formatEuro(piva.totalTaxShieldSaving)}`,
                note: I18N.t('table.r7_note', {
                    empIres: formatEuro(emp.iresDeductionSaving),
                    pivaIres: formatEuro(piva.iresDeductionSaving),
                    empIrap: formatEuro(emp.irapDeductionSaving),
                    pivaIrap: formatEuro(piva.irapDeductionSaving)
                })
            },
            {
                category: I18N.t('table.r8_cat'),
                label: I18N.t('table.r8_label'),
                empVal: formatEuro(emp.totalEmployerNetCostAfterTax),
                pivaVal: formatEuro(piva.totalCompanyNetCostAfterTax),
                highlight: true
            },
            {
                category: I18N.t('table.r9_cat'),
                label: I18N.t('table.r9_label'),
                empVal: `- ${formatEuro(emp.inpsEmployee)} (${formatNumber(emp.inpsEmployeeRatePct, 2)}%)`,
                pivaVal: `- ${formatEuro(piva.cassaContributions)}`,
                note: I18N.t('table.r9_note')
            },
            {
                category: I18N.t('table.r10_cat'),
                label: I18N.t('table.r10_label'),
                empVal: `- ${formatEuro(Math.max(0, emp.ral - emp.inpsEmployee - emp.netAnnualCash))}`,
                pivaVal: `- ${formatEuro(piva.incomeTaxAmount)}`,
                note: I18N.t('table.r10_note', {
                    detr: formatEuro(emp.detrazioneLavoroDipendente),
                    cuneo: formatEuro(emp.cuneoFiscaleBenefit)
                })
            },
            {
                category: I18N.t('table.r11_cat'),
                label: I18N.t('table.r11_label'),
                empVal: formatEuro(emp.netAnnualCash),
                pivaVal: formatEuro(piva.netAnnualCash),
                highlight: true,
                note: I18N.t('table.r11_note', {
                    empM: formatEuro(emp.netAnnualCash / 12),
                    pivaM: formatEuro(piva.netMonthlyCash)
                })
            },
            {
                category: I18N.t('table.r12_cat'),
                label: I18N.t('table.r12_label'),
                empVal: formatEuro(emp.netAnnualTotalWithTfr),
                pivaVal: formatEuro(piva.netAnnualCash),
                highlight: true,
                note: I18N.t('table.r12_note')
            }
        ];
        tbody.innerHTML = rows
            .map((r) => `
      <tr class="${r.highlight ? 'bg-indigo-50/70 font-semibold text-slate-900' : 'hover:bg-slate-50 text-slate-700'} border-b border-slate-200 transition-colors">
        <td class="py-3 px-4">
          <div class="text-xs uppercase tracking-wider font-semibold ${r.highlight ? 'text-indigo-700' : 'text-slate-400'}">${r.category}</div>
          <div class="text-sm font-medium text-slate-800">${r.label}</div>
          ${r.note ? `<div class="text-xs text-slate-500 mt-0.5">${r.note}</div>` : ''}
        </td>
        <td class="py-3 px-4 text-right font-mono text-sm ${r.highlight ? 'text-indigo-900 font-bold' : ''}">${r.empVal}</td>
        <td class="py-3 px-4 text-right font-mono text-sm ${r.highlight ? 'text-emerald-900 font-bold' : ''}">${r.pivaVal}</td>
      </tr>`)
            .join('');
    }
    renderBalanceSheetImpact(emp, piva) {
        const panel = document.getElementById('balance-impact-panel');
        if (!panel)
            return;
        const bs = this.activeVisura?.balanceSheets?.last;
        const ebitda = this.activeVisura?.operatingResults?.ebitda;
        if (!bs || (!bs.turnover && !bs.totalStaffCost)) {
            panel.classList.add('hidden');
            return;
        }
        panel.classList.remove('hidden');
        const turnover = bs.turnover || 0;
        const staffCost = bs.totalStaffCost || 0;
        const avgSal = bs.avgGrossSalary || 0;
        this.setText('impact-turnover-emp', turnover > 0 ? `${formatNumber((emp.totalEmployerGrossCost / turnover) * 100, 2)}%` : 'N/D');
        this.setText('impact-turnover-piva', turnover > 0 ? `${formatNumber((piva.totalCompanyGrossCost / turnover) * 100, 2)}%` : 'N/D');
        this.setText('impact-staff-emp', staffCost > 0 ? `+${formatNumber((emp.totalEmployerGrossCost / staffCost) * 100, 1)}%` : 'N/D');
        this.setText('impact-staff-piva', staffCost > 0
            ? I18N.t('balance.staff_piva_note', {
                pct: formatNumber((piva.totalCompanyGrossCost / staffCost) * 100, 1)
            })
            : 'N/D');
        if (avgSal > 0) {
            const diffVsAvg = ((emp.ral - avgSal) / avgSal) * 100;
            const sign = diffVsAvg >= 0 ? '+' : '';
            this.setText('impact-avg-salary-comparison', I18N.t('balance.avg_sal_comp', {
                diff: `${sign}${formatNumber(diffVsAvg, 1)}`,
                avg: formatEuro(avgSal)
            }));
        }
        else {
            this.setText('impact-avg-salary-comparison', I18N.t('balance.avg_sal_na'));
        }
        if (ebitda && ebitda > 0) {
            this.setText('impact-ebitda-emp', I18N.t('balance.ebitda_comp', {
                pct: formatNumber((emp.totalEmployerGrossCost / ebitda) * 100, 1),
                ebitda: formatEuro(ebitda)
            }));
        }
        else {
            this.setText('impact-ebitda-emp', I18N.t('balance.ebitda_req'));
        }
    }
    renderComplianceNotes(result) {
        const badge = document.getElementById('compliance-risk-badge');
        const list = document.getElementById('compliance-notes-list');
        if (badge) {
            const localizedRisk = I18N.t(`compliance.risk_${result.monocommittenzaRiskScore}`);
            badge.textContent = I18N.t('compliance.badge', { risk: localizedRisk });
            if (result.monocommittenzaRiskScore === 'ALTO') {
                badge.className = 'px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800';
            }
            else if (result.monocommittenzaRiskScore === 'MEDIO') {
                badge.className = 'px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800';
            }
            else {
                badge.className = 'px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800';
            }
        }
        if (list) {
            list.innerHTML = result.monocommittenzaNotes
                .map((n) => `<li class="text-xs text-slate-600 leading-relaxed">• ${n}</li>`)
                .join('');
        }
    }
    updateApiStatusBadge() {
        const badge = document.getElementById('api-status-indicator');
        if (!badge)
            return;
        const settings = this.apiService.getSettings();
        if (this.apiService.hasValidCustomToken()) {
            badge.className =
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300 whitespace-nowrap';
            badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-600"></span> ${I18N.t('header.status_token_active', { env: settings.ENVIRONMENT })}`;
        }
        else {
            badge.className =
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300 whitespace-nowrap';
            badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-500"></span> ${I18N.t('header.status_sandbox')}`;
        }
    }
    openApiSettingsModal() {
        const modal = document.getElementById('modal-api-settings');
        if (!modal)
            return;
        const settings = this.apiService.getSettings();
        this.setElementValue('modal-input-api-key', settings.API_KEY);
        this.setElementValue('modal-select-env', settings.ENVIRONMENT);
        this.setElementValue('modal-input-cors-proxy', settings.CORS_PROXY);
        modal.classList.remove('hidden');
    }
    closeApiSettingsModal() {
        const modal = document.getElementById('modal-api-settings');
        modal?.classList.add('hidden');
    }
    saveApiSettingsFromModal() {
        const keyEl = document.getElementById('modal-input-api-key');
        const envEl = document.getElementById('modal-select-env');
        const proxyEl = document.getElementById('modal-input-cors-proxy');
        this.apiService.updateSettings({
            API_KEY: keyEl?.value.trim() || '',
            ENVIRONMENT: envEl?.value || 'SANDBOX',
            CORS_PROXY: proxyEl?.value.trim() || ''
        });
        this.updateApiStatusBadge();
        this.closeApiSettingsModal();
    }
    exportSimulationJson() {
        const result = CostSimulationEngine.runSimulation(this.state);
        const payload = {
            generatedAt: new Date().toISOString(),
            companyVisura: this.activeVisura,
            inputs: this.state,
            results: result
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const vatSuffix = this.activeVisura ? `_${this.activeVisura.vatCode}` : '';
        a.download = `simulazione_costo_aziendale${vatSuffix}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
    setText(id, text) {
        const el = document.getElementById(id);
        if (el)
            el.textContent = text;
    }
}
// Avvio automatico al caricamento del DOM
document.addEventListener('DOMContentLoaded', () => {
    const app = new SimulatorAppController();
    void app.init();
});
