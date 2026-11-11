/**
 * Turns the signer contract's secp256k1 reply (R point and scalar s) into an Ethereum signature, so a group's NEAR-derived key can
 * sign a real EVM transaction. The recovery id is found by recovering the address, not trusted from the reply, and a high s is
 * normalised (Ethereum clients refuse non-canonical signatures).
 */
import { ethers } from 'ethers';

const N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');

export function signatureFromMpc(reply, digestHex, expectedAddress) {
  if (reply?.scheme !== 'Secp256k1') throw new Error(`expected a Secp256k1 reply, got ${reply?.scheme}`);
  const point = reply.big_r?.affine_point; const scalar = reply.s?.scalar;
  if (!point || !scalar) throw new Error('incomplete signature reply');
  const r = `0x${point.slice(2)}`; // drop the 02/03 compression prefix: r is the x coordinate
  let s = BigInt(`0x${scalar}`); if (s > N / 2n) s = N - s;
  const sHex = `0x${s.toString(16).padStart(64, '0')}`;
  for (const v of [27, 28]) {
    const sig = ethers.Signature.from({ r, s: sHex, v });
    if (ethers.recoverAddress(digestHex, sig).toLowerCase() === expectedAddress.toLowerCase()) return sig;
  }
  throw new Error('signature does not recover to the expected address');
}
