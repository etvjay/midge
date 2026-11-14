// Where the playground service runs, and the NEAR contract the page builds approval messages for (its own copy, never the service's). It stays null until the service is deployed, and the page says plainly that the playground is not running.
// At the deploy gate this is set to the service's public address, for example window.PLAYGROUND_CONFIG = { apiBase: 'https://<id>-8080.dstack-pha1-prod5.phala.network', contractId: 'c.fly-1793636729.testnet' };
window.PLAYGROUND_CONFIG = { apiBase: null, contractId: 'c.fly-1793636729.testnet' };
