import { fetchVerifiedModelKey } from './attestation.js';
import { sealToModel } from './e2ee.js';
import { RoostAggregationError } from './errors.js';

/**
 * Member side of the model-sealed Roost. A member never trusts the coordinator's word about which key to seal
 * to: it verifies the model attestation itself (no API key needed) and refuses if the coordinator advertised
 * a different key. A dishonest coordinator handing out its own key would otherwise read every bid.
 *
 * @param {{session: object, payload: object, baseUrl?: string, chain?: string, acceptedTcb?: string[], fetchImpl?: Function}} args
 *   session is the object returned by the Roost's session-key route.
 */
export async function sealBidForRoost({ session, payload, ...verifyOptions }) {
  if (!session || session.backend !== 'model-sealed') {
    throw new RoostAggregationError('this Roost is not in model-sealed mode; use its RSA public key instead');
  }
  const verified = await fetchVerifiedModelKey({ model: session.model, ...verifyOptions });
  if (session.modelPublicKey && session.modelPublicKey !== verified.publicKey) {
    throw new RoostAggregationError('coordinator advertised a model key that does not match the attested key; refusing to seal');
  }
  return {
    cipherTextHex: sealToModel(JSON.stringify(payload), verified.publicKey),
    modelPublicKey: verified.publicKey,
    tcbStatus: verified.tcbStatus,
  };
}
