/** HTTP client for the hosted Roost service. Members need only the open calls; the coordinator uses the rest. */
export class HostedRoostClient {
  #adminKey;

  constructor({ baseUrl, adminKey = null, fetchImpl = globalThis.fetch }) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.#adminKey = adminKey;
    this.fetch = fetchImpl;
  }

  async #call(method, path, body, admin = false) {
    const headers = { 'content-type': 'application/json' };
    if (admin) {
      if (!this.#adminKey) throw new Error('this call needs the coordinator key');
      headers['x-roost-admin-key'] = this.#adminKey;
    }
    const res = await this.fetch(`${this.baseUrl}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`roost ${path} answered ${res.status}: ${json.error || 'no detail'}`);
    return json;
  }

  getSession() { return this.#call('GET', '/session'); }
  getAttestationBundle(nonce) { return this.#call('GET', `/attestation?nonce=${encodeURIComponent(nonce)}`); }
  submitSealedIntent({ flyerId, cipherTextHex }) { return this.#call('POST', '/intents', { flyerId, cipherTextHex }); }
  aggregate({ roundId } = {}) { return this.#call('POST', '/aggregate', { roundId }, true); }
  signSettlement(params) { return this.#call('POST', '/settle', params, true); }
  runAuction(params) { return this.#call('POST', '/auction', params, true); }
  runPool(params) { return this.#call('POST', '/pool', params, true); }
  openRound(params) { return this.#call('POST', '/round', params, true); }
  inputDigests() { return this.#call('GET', '/digests', undefined, true); }
  excludeMembers(members) { return this.#call('POST', '/exclude', { members }, true); }
  submitSignedIntent(params) { return this.#call('POST', '/signed-intents', params); }
}
