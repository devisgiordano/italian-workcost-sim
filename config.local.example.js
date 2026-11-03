/**
 * ============================================================================
 * ESEMPIO DI CONFIGURAZIONE LOCALE (config.local.example.js)
 * ============================================================================
 * Per usare la tua chiave API reale di Openapi.it senza rischiare di
 * caricarla su GitHub:
 * 1. Copia questo file e rinominalo in "config.local.js"
 *    (il file "config.local.js" è già escluso da Git tramite .gitignore)
 * 2. Inserisci qui sotto il tuo Bearer Token generato da https://console.openapi.com/
 * ============================================================================
 */
window.APP_LOCAL_CONFIG = {
  OPENAPI: {
    API_KEY: 'INSERISCI_QUI_IL_TUO_BEARER_TOKEN_REALE',
    ENVIRONMENT: 'SANDBOX', // 'SANDBOX' oppure 'PRODUCTION'
    CORS_PROXY: ''
  }
};
