import http from 'node:http';

/**
 * Talks to the dstack guest agent over its unix socket (dstack 0.6 "v1" API).
 * Inside a Phala CVM the socket is /var/run/dstack.sock (mount it into the container).
 * No SDK is used: the protocol is plain HTTP, and the npm SDK predates the 0.6 attestation call.
 *
 * `simulated` must be set by the operator when pointing at the dstack simulator. A simulator
 * produces mock quotes, so the Roost must never claim its inputs are hidden in that mode.
 */
export class DstackSocketProvider {
  constructor({ socketPath = process.env.DSTACK_SOCKET || '/var/run/dstack.sock', timeoutMs = 10000, simulated = process.env.DSTACK_SIMULATOR === '1' } = {}) {
    this.socketPath = socketPath;
    this.timeoutMs = timeoutMs;
    this.simulated = simulated;
  }

  #post(path, body) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const req = http.request({
        socketPath: this.socketPath,
        path,
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), Host: 'localhost' },
        timeout: this.timeoutMs,
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          if (res.statusCode !== 200) return reject(new Error(`dstack socket ${path} answered ${res.statusCode}`));
          try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch { reject(new Error('dstack socket returned non-JSON')); }
        });
      });
      req.on('timeout', () => req.destroy(new Error('dstack socket timed out')));
      req.on('error', reject);
      req.end(data);
    });
  }

  /** @param {Buffer} reportData 1 to 64 bytes. Returns the versioned attestation as hex. */
  async attest(reportData) {
    if (!Buffer.isBuffer(reportData) || reportData.length < 1 || reportData.length > 64) throw new Error('report data must be 1 to 64 bytes');
    const res = await this.#post('/v1/Attest', { report_data: reportData.toString('hex'), include_boottime_gpu_evidence: false });
    if (typeof res.attestation !== 'string' || res.attestation.length === 0) throw new Error('dstack returned no attestation');
    return res.attestation;
  }

  /** Application identity as the guest agent reports it. Informational: verify through the attestation. */
  async info() {
    const r = await this.#post('/v1/Info', {});
    return {
      app_id: r.app_id, instance_id: r.instance_id, compose_hash: r.compose_hash,
      os_image_hash: r.os_image_hash, key_provider_info: r.key_provider_info,
    };
  }
}
