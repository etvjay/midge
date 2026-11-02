import crypto from 'node:crypto';

/**
 * Verification 1: Live TEE Hardware Attestation (HAQ)
 * Target: NEAR AI Cloud (AMD SEV-SNP / Intel TDX / NVIDIA GPU)
 * 
 * Parses live hardware attestation with cryptographic nonce binding:
 * 1. Generates a fresh 32-byte cryptographic nonce to defeat replay attacks.
 * 2. Queries NEAR AI Cloud attestation endpoint for target model.
 * 3. Parses Intel TDX Quote v4 binary structure at byte offsets:
 *    - Header: Quote Version (4), Attestation Key Type (2: ECDSA-256), TEE Type (0x81: TDX)
 *    - TD Report: MRTD (offset 184..232), RTMRs (offsets 376..568)
 *    - REPORTDATA (offset 568..632, 64 bytes):
 *      * Bytes 0..19: Enclave signing address (20 bytes)
 *      * Bytes 20..31: Zero padding (12 bytes)
 *      * Bytes 32..63: Cryptographic nonce binding (32 bytes)
 * 4. Checks Model Enclave attestation with NVIDIA GPU payload presence and nonce echo.
 * 5. Fails closed: Rejects immediately if any check or nonce binding fails.
 * Note: Full Intel SGX/TDX Root CA signature verification is pending (tracked in GAP-006).
 */
export async function verifyHardwareAttestation() {
  console.log('\n======================================================');
  console.log(' [VERIFICATION 1] LIVE TEE HARDWARE ATTESTATION (HAQ)');
  console.log(' Target: NEAR AI Cloud (AMD SEV-SNP / Intel TDX / NVIDIA)');
  console.log('======================================================');

  // 1. Generate a cryptographically secure 32-byte nonce (replay protection)
  const sessionNonce = crypto.randomBytes(32).toString('hex');
  console.log(`[1/5] Generated Fresh Nonce: ${sessionNonce.slice(0, 16)}... (32 bytes)`);

  const model = 'Qwen/Qwen3.6-35B-A3B-FP8';
  const url = `https://cloud-api.near.ai/v1/attestation/report?model=${encodeURIComponent(model)}&signing_algo=ecdsa&nonce=${sessionNonce}`;

  console.log(`[2/5] Querying Attestation Report from NEAR AI Cloud...`);
  const startTime = Date.now();
  const res = await fetch(url);
  const latency = Date.now() - startTime;

  if (!res.ok) {
    throw new Error(`Attestation endpoint failed with status ${res.status}: ${await res.text()}`);
  }

  const report = await res.json();
  console.log(`[3/5] Received Report in ${latency}ms`);

  // 2. Structural Presence Check
  const gateway = report.gateway_attestation;
  const modelAtt = report.model_attestations?.[0];

  if (!gateway || !gateway.intel_quote) {
    throw new Error('[HAQ REJECT] Gateway Intel TDX quote missing from attestation report.');
  }
  if (!modelAtt || !modelAtt.nvidia_payload) {
    throw new Error('[HAQ REJECT] Model NVIDIA GPU attestation payload missing.');
  }

  // 3. Byte-Level Parsing of Intel TDX Quote v4
  console.log(`[4/5] Parsing Intel TDX Quote v4 Byte Structure...`);
  const quoteBuf = Buffer.from(gateway.intel_quote, 'hex');
  if (quoteBuf.length < 636) {
    throw new Error(`[HAQ REJECT] Intel TDX quote length too short: ${quoteBuf.length} bytes (expected >= 636).`);
  }

  // Quote Header (48 bytes)
  const quoteVersion = quoteBuf.readUInt16LE(0);
  const attKeyType = quoteBuf.readUInt16LE(2);
  const teeType = quoteBuf.readUInt32LE(4);

  if (quoteVersion !== 4) {
    throw new Error(`[HAQ REJECT] Unexpected Intel Quote version: ${quoteVersion} (expected 4).`);
  }
  if (attKeyType !== 2) {
    throw new Error(`[HAQ REJECT] Unexpected Attestation Key Type: ${attKeyType} (expected 2: ECDSA-256).`);
  }
  if (teeType !== 0x81) {
    throw new Error(`[HAQ REJECT] Unexpected TEE Type: 0x${teeType.toString(16)} (expected 0x81: Intel TDX).`);
  }

  // TD Report Body: MRTD & REPORTDATA
  const mrtd = quoteBuf.subarray(184, 232).toString('hex');
  const quoteReportData = quoteBuf.subarray(568, 632).toString('hex');
  const expectedReportData = gateway.report_data?.toLowerCase();

  if (quoteReportData.toLowerCase() !== expectedReportData) {
    throw new Error('[HAQ REJECT] Quote REPORTDATA mismatch against gateway report_data payload.');
  }

  // 4. Nonce & Signing Key Binding Verification (Quote REPORTDATA 64 bytes)
  console.log(`[5/5] Cryptographic Invariant & Nonce Binding Verification:`);
  const signerInQuote = quoteReportData.slice(0, 40).toLowerCase();
  const gatewaySigner = gateway.signing_address.replace(/^0x/i, '').toLowerCase();
  const nonceInQuote = quoteReportData.slice(64, 128).toLowerCase();

  const isSignerBound = signerInQuote === gatewaySigner;
  const isNonceBound = nonceInQuote === sessionNonce.toLowerCase();
  const isModelNonceBound = modelAtt.request_nonce?.toLowerCase() === sessionNonce.toLowerCase();
  const nvidiaPayloadBytes = typeof modelAtt.nvidia_payload === 'string'
    ? Math.floor(modelAtt.nvidia_payload.length / 2)
    : Buffer.from(JSON.stringify(modelAtt.nvidia_payload)).length;

  console.log(`  - Intel TDX Quote:     PARSED v4 (TEE Type: 0x81 TDX, Length: ${quoteBuf.length} bytes)`);
  console.log(`  - MRTD Measurement:    ${mrtd.slice(0, 16)}... (Parsed)`);
  console.log(`  - Gateway Signer Key:  0x${gatewaySigner} (${isSignerBound ? 'BOUND' : 'UNBOUND'})`);
  console.log(`  - Client Nonce Echo:   ${sessionNonce.slice(0, 16)}... (${isNonceBound ? 'VERIFIED' : 'FAILED'})`);
  console.log(`  - Model TEE Enclave:   ${modelAtt.model_name} (Active, Nonce Echo: ${isModelNonceBound ? 'OK' : 'MISMATCH'})`);
  console.log(`  - NVIDIA GPU Payload:  PRESENT (${nvidiaPayloadBytes} bytes payload, signature unverified)`);
  console.log(`  - Model Signer Key:    ${modelAtt.signing_address}`);

  // Fail Closed if any invariant fails
  if (!isSignerBound) {
    throw new Error(`[HAQ REJECT] Quote signing address (0x${signerInQuote}) does not match gateway signer (0x${gatewaySigner}).`);
  }
  if (!isNonceBound || !isModelNonceBound) {
    throw new Error(`[HAQ REJECT] Nonce mismatch! Replay attack detected or quote nonce does not match request.`);
  }

  console.log('\n>>> [PASS] HAQ VERIFICATION SUCCESSFUL: Intel TDX Quote v4 Parsed & Nonce-Bound (Intel Root CA & GPU Attestation Signature Pending - GAP-006).');
  return {
    verified: true,
    nonce: sessionNonce,
    quoteVersion,
    teeType: 'Intel TDX (0x81)',
    mrtd,
    gatewaySigner: `0x${gatewaySigner}`,
    modelSigner: modelAtt.signing_address,
    latencyMs: latency,
  };
}

// Direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  verifyHardwareAttestation().catch((err) => {
    console.error('FAILED:', err);
    process.exit(1);
  });
}
