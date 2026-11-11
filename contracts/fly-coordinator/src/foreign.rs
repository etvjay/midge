//! Foreign-chain transactions, built inside the contract.
//!
//! The contract does not sign anything itself. It asks the NEAR MPC signer to sign a digest, and the digest has to be one the
//! contract built from fields it has checked against the group's rules (chain, payee, amount). If the room supplied the digest,
//! a valid signature could authorise a different payment than the one the rules allowed. These builders are pure and are tested
//! byte for byte against the JavaScript builders that already signed live transactions on Solana devnet and Ethereum Sepolia.

use near_sdk::json_types::U128;
use near_sdk::near;

/// One payee a group may pay on another chain: the chain, the address, the most one payment may be, and the most that may ever be
/// requested for this payee (the running total reserves budget before signing, so two requests cannot spend the same budget).
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct ForeignPayee {
    pub chain: String,
    pub address: String,
    pub max_amount: U128,
    pub max_total: U128,
}

/// The foreign-payment rules of a group. Set once by the owner before the first deposit, so a depositor can read them before putting
/// money in, and it cannot change afterwards. `max_fee_cost` bounds gas_limit x max_fee on Ethereum so a room cannot burn the
/// group's funds in fees.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct ForeignPolicy {
    pub payees: Vec<ForeignPayee>,
    pub max_fee_cost: U128,
    /// How long a running total lasts, in blocks. A payee's `max_total` is the most that may be reserved inside one window, so a reservation
    /// that never resolves (its signature may or may not exist, and the contract cannot see the other chain) locks capacity for one window
    /// and not forever. The same idea as the NEAR release cap.
    pub window_blocks: u64,
}

/// One payment the room asks for. Fields not used by the chain are None.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct ForeignPaymentRequest {
    pub obligation_id: String,
    pub chain: String,
    pub from: String,
    pub payee: String,
    pub amount: U128,
    pub recent_blockhash: Option<String>,
    pub evm_nonce: Option<u64>,
    pub max_priority_fee: Option<U128>,
    pub max_fee: Option<U128>,
    pub gas_limit: Option<u64>,
}

/// What the contract remembers about a payment it asked the signer to sign.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct ForeignObligation {
    pub chain: String,
    pub payee: String,
    pub amount: U128,
    pub since_block: u64,
    pub signed: bool,
}

/// The text the room signs for a foreign payment. It carries every field the transaction is built from, so the contract can
/// check that the room approved exactly this payment.
pub fn foreign_payment_message(
    contract: &str,
    syndicate_id: &str,
    epoch: u64,
    round_nonce: &str,
    r: &ForeignPaymentRequest,
) -> String {
    let params = match &r.recent_blockhash {
        Some(b) => b.clone(),
        None => format!(
            "{}:{}:{}:{}",
            r.evm_nonce.unwrap_or(0),
            r.max_priority_fee.map(|v| v.0).unwrap_or(0),
            r.max_fee.map(|v| v.0).unwrap_or(0),
            r.gas_limit.unwrap_or(0)
        ),
    };
    format!(
        "{}:{}:{}:{}:foreign:{}:{}:{}:{}:{}:{}",
        contract,
        syndicate_id,
        epoch,
        round_nonce,
        r.obligation_id,
        r.chain,
        r.from,
        r.payee,
        r.amount.0,
        params
    )
}

/// A window shorter than this means nothing (it is about two minutes of NEAR blocks).
pub const MIN_FOREIGN_WINDOW_BLOCKS: u64 = 100;

/// What has been reserved for one payee in the current window.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct ForeignSpent {
    pub window_start: u64,
    pub spent: U128,
}

pub const KNOWN_CHAINS: [&str; 2] = ["solana-devnet", "ethereum-sepolia"];

const B58: &[u8; 58] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/// Decode a base58 string (Solana addresses and blockhashes). None if a character is outside the alphabet.
pub fn base58_decode(s: &str) -> Option<Vec<u8>> {
    let mut bytes: Vec<u8> = Vec::new(); // little-endian magnitude
    for c in s.bytes() {
        let mut carry = B58.iter().position(|&x| x == c)? as u32;
        for b in bytes.iter_mut() {
            carry += (*b as u32) * 58;
            *b = (carry & 0xff) as u8;
            carry >>= 8;
        }
        while carry > 0 {
            bytes.push((carry & 0xff) as u8);
            carry >>= 8;
        }
    }
    let zeros = s.bytes().take_while(|&c| c == b'1').count();
    let mut out = vec![0u8; zeros];
    out.extend(bytes.iter().rev());
    Some(out)
}

/// A 20-byte address from hex, with or without the 0x prefix. None unless it is exactly 40 hex characters.
pub fn hex_to_20(s: &str) -> Option<[u8; 20]> {
    let t = s
        .strip_prefix("0x")
        .or_else(|| s.strip_prefix("0X"))
        .unwrap_or(s);
    if t.len() != 40 {
        return None;
    }
    let raw = hex::decode(t).ok()?;
    let mut a = [0u8; 20];
    a.copy_from_slice(&raw);
    Some(a)
}

/// The legacy Solana message for one System Program transfer: header (1 signature, 0 read-only signed, 1 read-only unsigned),
/// accounts [from, to, system program], the recent blockhash, and one instruction (transfer = 2, then the lamports, little-endian).
pub fn solana_transfer_message(
    from: &[u8; 32],
    to: &[u8; 32],
    lamports: u64,
    recent_blockhash: &[u8; 32],
) -> Vec<u8> {
    let mut m = Vec::with_capacity(150);
    m.extend_from_slice(&[1, 0, 1, 3]);
    m.extend_from_slice(from);
    m.extend_from_slice(to);
    m.extend_from_slice(&[0u8; 32]); // the System Program
    m.extend_from_slice(recent_blockhash);
    m.push(1); // one instruction
    m.push(2); // program id index: the System Program
    m.push(2); // two accounts
    m.extend_from_slice(&[0, 1]);
    m.push(12); // data length
    m.extend_from_slice(&2u32.to_le_bytes());
    m.extend_from_slice(&lamports.to_le_bytes());
    m
}

fn rlp_bytes(b: &[u8]) -> Vec<u8> {
    if b.len() == 1 && b[0] < 0x80 {
        return b.to_vec();
    }
    let mut out = rlp_len(b.len(), 0x80);
    out.extend_from_slice(b);
    out
}

fn rlp_len(len: usize, offset: u8) -> Vec<u8> {
    if len < 56 {
        return vec![offset + len as u8];
    }
    let be: Vec<u8> = len
        .to_be_bytes()
        .iter()
        .copied()
        .skip_while(|&x| x == 0)
        .collect();
    let mut out = vec![offset + 55 + be.len() as u8];
    out.extend(be);
    out
}

/// An integer as RLP wants it: big-endian with no leading zeros, and zero as the empty string.
fn rlp_uint(v: u128) -> Vec<u8> {
    let be: Vec<u8> = v
        .to_be_bytes()
        .iter()
        .copied()
        .skip_while(|&x| x == 0)
        .collect();
    rlp_bytes(&be)
}

/// The digest an EIP-1559 plain transfer is signed over: keccak256(0x02 || rlp([chain id, nonce, max priority fee, max fee,
/// gas limit, to, value, empty data, empty access list])). `keccak` is passed in so the contract uses the host function
/// and tests can use the same one.
#[allow(clippy::too_many_arguments)]
pub fn evm_transfer_digest<F: Fn(&[u8]) -> Vec<u8>>(
    chain_id: u64,
    nonce: u64,
    max_priority_fee: u128,
    max_fee: u128,
    gas_limit: u64,
    to: &[u8; 20],
    value: u128,
    keccak: F,
) -> [u8; 32] {
    let mut body = Vec::new();
    body.extend(rlp_uint(chain_id as u128));
    body.extend(rlp_uint(nonce as u128));
    body.extend(rlp_uint(max_priority_fee));
    body.extend(rlp_uint(max_fee));
    body.extend(rlp_uint(gas_limit as u128));
    body.extend(rlp_bytes(to));
    body.extend(rlp_uint(value));
    body.extend(rlp_bytes(&[])); // data
    body.push(0xc0); // empty access list
    let mut payload = rlp_len(body.len(), 0xc0);
    payload.extend(body);
    let mut msg = vec![0x02];
    msg.extend(payload);
    let h = keccak(&msg);
    let mut out = [0u8; 32];
    out.copy_from_slice(&h);
    out
}
