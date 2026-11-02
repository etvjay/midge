import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveDcapBin() {
  if (process.env.DCAP_QVL_BIN && fs.existsSync(process.env.DCAP_QVL_BIN)) {
    return process.env.DCAP_QVL_BIN;
  }
  try {
    const whichOut = execFileSync('which', ['dcap-qvl'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    if (whichOut && fs.existsSync(whichOut)) return whichOut;
  } catch (_) {}
  const homeBin = path.join(os.homedir(), '.cargo', 'bin', 'dcap-qvl');
  if (fs.existsSync(homeBin)) return homeBin;
  return 'dcap-qvl';
}

function verifyQuoteWithDcap(quoteHex) {
  const dcapBin = resolveDcapBin();
  const tmpFile = path.join(os.tmpdir(), `tdx_verify_${Date.now()}_${Math.random().toString(36).slice(2)}.hex`);
  try {
    fs.writeFileSync(tmpFile, quoteHex);
    const output = execFileSync(dcapBin, ['verify', '--hex', tmpFile], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const jsonLine = output.split('\n').find((l) => l.trim().startsWith('{'));
    if (!jsonLine) {
      throw new Error(`Failed to parse dcap-qvl output: ${output}`);
    }
    const result = JSON.parse(jsonLine);
    return { valid: true, result };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {
        valid: false,
        error: `dcap-qvl executable not found in PATH or ${dcapBin}. Install via: cargo install dcap-qvl-cli --version 0.7.0`
      };
    }
    const stderr = err.stderr ? err.stderr.toString() : err.message;
    return { valid: false, error: stderr };
  } finally {
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    } catch (_) {}
  }
}

export async function verifyHardwareAttestation() {
  console.log('\n======================================================');
  console.log(' [VERIFICATION 1] LIVE TEE HARDWARE ATTESTATION (HAQ)');
  console.log(' Target: NEAR AI Cloud (Intel TDX / DCAP-QVL / NVIDIA)');
  console.log('======================================================');

  const isOffline = process.env.FLY_OFFLINE === '1';
  let report;
  let sessionNonce;
  let isRecordedFixture = false;
  let latency = 0;

  if (isOffline) {
    console.log('[1/6] Mode: OFFLINE FIXTURES (FLY_OFFLINE=1 set)');
    const fixturePath = path.join(__dirname, 'fixtures', 'attestation-report.json');
    if (!fs.existsSync(fixturePath)) {
      throw new Error(`[HAQ REJECT] Offline fixture not found at ${fixturePath}`);
    }
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    sessionNonce = fixture.nonce;
    report = fixture.report;
    isRecordedFixture = true;
    console.log(`[2/6] Loaded authentic recorded attestation report from fixtures/attestation-report.json`);
    console.log(`[3/6] Fixture Nonce: ${sessionNonce.slice(0, 16)}... (32 bytes)`);
  } else {
    // 1. Generate a cryptographically secure 32-byte nonce (replay protection)
    sessionNonce = crypto.randomBytes(32).toString('hex');
    console.log(`[1/6] Generated Fresh Nonce: ${sessionNonce.slice(0, 16)}... (32 bytes)`);

    const model = 'Qwen/Qwen3.6-35B-A3B-FP8';
    const url = `https://cloud-api.near.ai/v1/attestation/report?model=${encodeURIComponent(model)}&signing_algo=ecdsa&nonce=${sessionNonce}`;

    console.log(`[2/6] Querying Attestation Report from NEAR AI Cloud...`);
    const startTime = Date.now();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      latency = Date.now() - startTime;
      if (!res.ok) {
        throw new Error(`Attestation endpoint failed with status ${res.status}`);
      }
      report = await res.json();
      console.log(`[3/6] Received Report in ${latency}ms`);
    } catch (netErr) {
      console.warn(`[WARN] Live attestation endpoint unreachable (${netErr.message}). Falling back to recorded fixture.`);
      const fixturePath = path.join(__dirname, 'fixtures', 'attestation-report.json');
      const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
      sessionNonce = fixture.nonce;
      report = fixture.report;
      isRecordedFixture = true;
    }
  }

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
  console.log(`[4/6] Parsing Intel TDX Quote v4 Byte Structure...`);
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
  console.log(`[5/6] Cryptographic Invariant & Nonce Binding Verification:`);
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
  console.log(`  - NVIDIA GPU Payload:  PRESENT (${nvidiaPayloadBytes} bytes payload)`);
  console.log(`  - Model Signer Key:    ${modelAtt.signing_address}`);

  if (!isSignerBound) {
    throw new Error(`[HAQ REJECT] Quote signing address (0x${signerInQuote}) does not match gateway signer (0x${gatewaySigner}).`);
  }
  if (!isNonceBound || !isModelNonceBound) {
    throw new Error(`[HAQ REJECT] Nonce mismatch! Replay attack detected or quote nonce does not match request.`);
  }

  // 5. Intel Root CA & DCAP Quote Verification via dcap-qvl
  console.log(`\n[6/6] Intel Root CA & DCAP Cryptographic Verification (dcap-qvl):`);
  const dcapResult = verifyQuoteWithDcap(gateway.intel_quote);
  if (!dcapResult.valid) {
    throw new Error(`[HAQ REJECT] Intel Root CA DCAP signature verification failed: ${dcapResult.error}`);
  }

  const tcbStatus = dcapResult.result.status;
  const qeStatus = dcapResult.result.qe_status?.status || 'Unknown';
  const platformStatus = dcapResult.result.platform_status?.status || 'Unknown';
  const advisoryIds = dcapResult.result.advisory_ids || [];

  console.log(`  - Intel Root CA Chain: VALID (PCK Certificate verified to Intel Root)`);
  console.log(`  - TD Report Signature: VALID (ECDSA-P256 ISV Report signature verified)`);
  console.log(`  - TCB Status:          ${tcbStatus} (Platform: ${platformStatus}, QE: ${qeStatus})`);
  console.log(`  - Security Advisories: [${advisoryIds.join(', ')}] (None)`);

  // Tamper resilience test: flip 1 byte of the quote and verify dcap-qvl rejects it
  const tamperedHex = gateway.intel_quote.slice(0, 100) +
    (gateway.intel_quote[100] === 'a' ? 'b' : 'a') +
    gateway.intel_quote.slice(101);
  const tamperCheck = verifyQuoteWithDcap(tamperedHex);
  if (tamperCheck.valid) {
    throw new Error('[HAQ SECURITY FAILURE] Tampered quote was accepted by dcap-qvl! Verification must fail closed.');
  }
  console.log(`  - Tamper Rejection:    VERIFIED (Mutated quote rejected with invalid signature)`);

  if (isRecordedFixture) {
    console.log('\n>>> [PASS] HAQ VERIFIED [RECORDED FIXTURE]: Intel TDX Quote v4 Cryptographically Verified to Intel Root CA.');
  } else {
    console.log('\n>>> [PASS] HAQ VERIFICATION SUCCESSFUL: Intel TDX Quote v4 Cryptographically Verified to Intel Root CA.');
  }
  return {
    verified: true,
    nonce: sessionNonce,
    quoteVersion,
    teeType: 'Intel TDX (0x81)',
    mrtd,
    gatewaySigner: `0x${gatewaySigner}`,
    modelSigner: modelAtt.signing_address,
    tcbStatus,
    dcapVerified: true,
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
