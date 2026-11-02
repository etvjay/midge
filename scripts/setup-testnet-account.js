import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function bs58encode(buffer) {
  const digits = [0];
  for (let i = 0; i < buffer.length; i++) {
    for (let j = 0; j < digits.length; j++) digits[j] <<= 8;
    digits[0] += buffer[i];
    let carry = 0;
    for (let j = 0; j < digits.length; j++) {
      digits[j] += carry;
      carry = (digits[j] / 58) | 0;
      digits[j] %= 58;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) digits.push(0);
  return digits.reverse().map(d => ALPHABET[d]).join('');
}

async function main() {
  const envPath = path.join(rootDir, '.env');

  // Check if .env already has credentials
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    if (envContent.includes('NEAR_ACCOUNT_ID=') && envContent.includes('NEAR_PRIVATE_KEY=')) {
      console.log('✓ Existing testnet credentials found in .env');
      return;
    }
  }

  console.log('Generating fresh Ed25519 keypair for NEAR testnet...');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const rawPub = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  const rawPriv = privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(-32);
  const fullPriv = Buffer.concat([rawPriv, rawPub]);

  const pubStr = 'ed25519:' + bs58encode(rawPub);
  const privStr = 'ed25519:' + bs58encode(fullPriv);

  const accountId = 'fly-' + Math.floor(Date.now() / 1000) + '.testnet';
  console.log(`Requesting testnet account creation: ${accountId}`);

  const res = await fetch('https://helper.testnet.near.org/account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      newAccountId: accountId,
      newAccountPublicKey: pubStr
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to create testnet account (${res.status}): ${errText}`);
  }

  const result = await res.json();
  const txHash = result.transaction?.hash || 'unknown';
  console.log(`✓ Testnet account created on-chain: ${accountId}`);
  console.log(`✓ Faucet funding transaction: ${txHash}`);
  console.log(`  Explorer: https://testnet.nearblocks.io/txns/${txHash}`);

  // Write securely to .env without printing key
  const envLines = [
    `NEAR_NETWORK=testnet`,
    `NEAR_ACCOUNT_ID=${accountId}`,
    `NEAR_PUBLIC_KEY=${pubStr}`,
    `NEAR_PRIVATE_KEY=${privStr}`
  ];

  fs.writeFileSync(envPath, envLines.join('\n') + '\n', { mode: 0o600 });
  console.log(`✓ Saved credentials securely to ${envPath} (mode 0600)`);
}

main().catch(err => {
  console.error('Account generation error:', err.message);
  process.exit(1);
});
