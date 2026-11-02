import crypto from 'node:crypto';

/**
 * Enclave Cryptographic Engine:
 * Implements real asymmetric encryption so Flyers encrypt with the Roost's
 * ephemeral public key, and only the hardware TEE can decrypt in RAM.
 */
export class EnclaveCrypto {
  /**
   * Generates a 2048-bit RSA keypair representing the ephemeral TEE session keys.
   */
  static generateEnclaveKeypair() {
    return crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
  }

  /**
   * Flyer-side encryption: encrypts private parameters using the Roost's public key.
   */
  static encryptIntent(payload, roostPublicKeyPem) {
    const buffer = Buffer.from(JSON.stringify(payload));
    const encrypted = crypto.publicEncrypt(
      {
        key: roostPublicKeyPem,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      buffer
    );
    return encrypted.toString('base64');
  }

  /**
   * Roost-side decryption: executes strictly within TEE memory boundary.
   */
  static decryptIntent(encryptedBase64, roostPrivateKeyPem) {
    const buffer = Buffer.from(encryptedBase64, 'base64');
    const decrypted = crypto.privateDecrypt(
      {
        key: roostPrivateKeyPem,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      buffer
    );
    return JSON.parse(decrypted.toString('utf8'));
  }

  /**
   * Sign a batch consensus proof with the enclave's private key.
   */
  static signBatch(batchPayload, roostPrivateKeyPem) {
    const sign = crypto.createSign('SHA256');
    sign.update(JSON.stringify(batchPayload));
    sign.end();
    return sign.sign(roostPrivateKeyPem, 'hex');
  }

  /**
   * On-chain contract verification of the enclave's batch signature.
   */
  static verifyBatchSignature(batchPayload, signatureHex, roostPublicKeyPem) {
    const verify = crypto.createVerify('SHA256');
    verify.update(JSON.stringify(batchPayload));
    verify.end();
    return verify.verify(roostPublicKeyPem, signatureHex, 'hex');
  }
}
