//! A deliberately plain public multisig treasury: the baseline Midge's room programs are measured against when the
//! alternative is "trustees decide". Signers propose and approve payments in public; at the threshold anyone executes.
//! There is no sealing and no limit on where the money may go: a majority of signers can pay anyone. That is the trust
//! this baseline asks for. Our own minimal reimplementation of the common pattern, not any other project's contract.
use near_sdk::store::LookupMap;
use near_sdk::{env, near, AccountId, NearToken, Promise};

pub const MAX_SIGNERS: usize = 20;

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Proposal {
    pub to: AccountId,
    pub amount: NearToken,
    pub proposer: AccountId,
    pub approvals: Vec<AccountId>,
    pub executed: bool,
    pub block: u64,
}

#[near(contract_state)]
pub struct PublicMultisig {
    signers: Vec<AccountId>,
    threshold: u32,
    next_id: u64,
    proposals: LookupMap<u64, Proposal>,
}

impl Default for PublicMultisig {
    fn default() -> Self {
        env::panic_str("the multisig must be initialised with new(signers, threshold)")
    }
}

#[near]
impl PublicMultisig {
    #[init]
    pub fn new(signers: Vec<AccountId>, threshold: u32) -> Self {
        assert!(
            threshold >= 1 && threshold as usize <= signers.len(),
            "threshold must be between 1 and the number of signers"
        );
        assert!(signers.len() <= MAX_SIGNERS, "at most 20 signers");
        for (i, a) in signers.iter().enumerate() {
            assert!(!signers[..i].contains(a), "duplicate signer");
        }
        Self {
            signers,
            threshold,
            next_id: 0,
            proposals: LookupMap::new(b"p"),
        }
    }

    fn assert_signer(&self, who: &AccountId) {
        assert!(self.signers.contains(who), "only a signer can do this");
    }

    pub fn propose(&mut self, to: AccountId, amount: NearToken) -> u64 {
        let who = env::predecessor_account_id();
        self.assert_signer(&who);
        assert!(amount.as_yoctonear() > 0, "amount must be positive");
        let id = self.next_id;
        self.next_id += 1;
        self.proposals.insert(
            id,
            Proposal {
                to,
                amount,
                proposer: who.clone(),
                approvals: vec![who],
                executed: false,
                block: env::block_height(),
            },
        );
        id
    }

    pub fn approve(&mut self, proposal_id: u64) {
        let who = env::predecessor_account_id();
        self.assert_signer(&who);
        let p = self
            .proposals
            .get_mut(&proposal_id)
            .unwrap_or_else(|| env::panic_str("no such proposal"));
        assert!(!p.executed, "already executed");
        assert!(!p.approvals.contains(&who), "already approved");
        p.approvals.push(who);
    }

    pub fn execute(&mut self, proposal_id: u64) {
        let threshold = self.threshold;
        let p = self
            .proposals
            .get_mut(&proposal_id)
            .unwrap_or_else(|| env::panic_str("no such proposal"));
        assert!(!p.executed, "already executed");
        assert!(
            p.approvals.len() as u32 >= threshold,
            "needs {} approvals",
            threshold
        );
        assert!(env::account_balance() >= p.amount, "insufficient balance");
        p.executed = true;
        let _ = Promise::new(p.to.clone()).transfer(p.amount);
    }

    pub fn get_proposal(&self, proposal_id: u64) -> Option<Proposal> {
        self.proposals.get(&proposal_id).cloned()
    }

    pub fn get_signers(&self) -> (Vec<AccountId>, u32) {
        (self.signers.clone(), self.threshold)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{get_created_receipts, VMContextBuilder};
    use near_sdk::{testing_env, AccountId, NearToken};

    const NEAR: u128 = 1_000_000_000_000_000_000_000_000;

    fn ctx(who: &str, block: u64, balance_near: u128) {
        let mut b = VMContextBuilder::new();
        b.predecessor_account_id(who.parse().unwrap())
            .account_balance(NearToken::from_yoctonear(balance_near * NEAR))
            .block_height(block);
        testing_env!(b.build());
    }
    fn acct(s: &str) -> AccountId {
        s.parse().unwrap()
    }
    fn signers() -> Vec<AccountId> {
        ["s1.near", "s2.near", "s3.near", "s4.near", "s5.near"]
            .iter()
            .map(|s| acct(s))
            .collect()
    }
    fn treasury() -> PublicMultisig {
        ctx("deployer.near", 10, 100);
        PublicMultisig::new(signers(), 3)
    }
    fn transfers() -> Vec<(String, u128)> {
        let mut out = Vec::new();
        for r in get_created_receipts() {
            for a in r.actions {
                if let near_sdk::mock::MockAction::Transfer { deposit, .. } = a {
                    out.push((r.receiver_id.to_string(), deposit.as_yoctonear()));
                }
            }
        }
        out
    }

    #[test]
    fn a_proposal_is_public_with_its_approvers() {
        let mut c = treasury();
        ctx("s1.near", 11, 100);
        let id = c.propose(acct("pay.near"), NearToken::from_yoctonear(5 * NEAR));
        ctx("s2.near", 12, 100);
        c.approve(id);
        let p = c.get_proposal(id).unwrap();
        assert_eq!(p.to.as_str(), "pay.near");
        assert_eq!(p.amount.as_yoctonear(), 5 * NEAR);
        assert_eq!(
            p.approvals.iter().map(|a| a.as_str()).collect::<Vec<_>>(),
            vec!["s1.near", "s2.near"]
        );
        assert!(!p.executed);
    }

    #[test]
    fn at_the_threshold_anyone_executes_and_the_money_moves_once() {
        let mut c = treasury();
        ctx("s1.near", 11, 100);
        let id = c.propose(acct("pay.near"), NearToken::from_yoctonear(5 * NEAR));
        ctx("s2.near", 12, 100);
        c.approve(id);
        ctx("s3.near", 13, 100);
        c.approve(id);
        ctx("anyone.near", 14, 100);
        c.execute(id);
        assert_eq!(transfers(), vec![("pay.near".to_string(), 5 * NEAR)]);
        assert!(c.get_proposal(id).unwrap().executed);
    }

    #[test]
    #[should_panic(expected = "needs 3 approvals")]
    fn below_the_threshold_it_does_not_execute() {
        let mut c = treasury();
        ctx("s1.near", 11, 100);
        let id = c.propose(acct("pay.near"), NearToken::from_yoctonear(5 * NEAR));
        ctx("s2.near", 12, 100);
        c.approve(id);
        ctx("anyone.near", 14, 100);
        c.execute(id);
    }

    #[test]
    #[should_panic(expected = "already executed")]
    fn a_proposal_executes_only_once() {
        let mut c = treasury();
        ctx("s1.near", 11, 100);
        let id = c.propose(acct("pay.near"), NearToken::from_yoctonear(5 * NEAR));
        for (s, b) in [("s2.near", 12), ("s3.near", 13)] {
            ctx(s, b, 100);
            c.approve(id);
        }
        ctx("anyone.near", 14, 100);
        c.execute(id);
        c.execute(id);
    }

    #[test]
    #[should_panic(expected = "only a signer")]
    fn a_non_signer_cannot_propose() {
        let mut c = treasury();
        ctx("outsider.near", 11, 100);
        c.propose(acct("pay.near"), NearToken::from_yoctonear(NEAR));
    }

    #[test]
    #[should_panic(expected = "only a signer")]
    fn a_non_signer_cannot_approve() {
        let mut c = treasury();
        ctx("s1.near", 11, 100);
        let id = c.propose(acct("pay.near"), NearToken::from_yoctonear(NEAR));
        ctx("outsider.near", 12, 100);
        c.approve(id);
    }

    #[test]
    #[should_panic(expected = "already approved")]
    fn a_signer_approves_once() {
        let mut c = treasury();
        ctx("s1.near", 11, 100);
        let id = c.propose(acct("pay.near"), NearToken::from_yoctonear(NEAR));
        c.approve(id);
    }

    #[test]
    #[should_panic(expected = "insufficient balance")]
    fn it_cannot_pay_more_than_it_holds() {
        let mut c = treasury();
        ctx("s1.near", 11, 3);
        let id = c.propose(acct("pay.near"), NearToken::from_yoctonear(50 * NEAR));
        for (s, b) in [("s2.near", 12), ("s3.near", 13)] {
            ctx(s, b, 3);
            c.approve(id);
        }
        ctx("anyone.near", 14, 3);
        c.execute(id);
    }

    #[test]
    #[should_panic(expected = "threshold")]
    fn the_threshold_cannot_exceed_the_signers() {
        ctx("deployer.near", 10, 100);
        PublicMultisig::new(signers(), 6);
    }

    #[test]
    #[should_panic(expected = "threshold")]
    fn the_threshold_cannot_be_zero() {
        ctx("deployer.near", 10, 100);
        PublicMultisig::new(signers(), 0);
    }

    #[test]
    #[should_panic(expected = "duplicate signer")]
    fn signers_must_be_distinct() {
        ctx("deployer.near", 10, 100);
        PublicMultisig::new(vec![acct("a.near"), acct("a.near"), acct("b.near")], 2);
    }

    #[test]
    fn a_majority_can_pay_anyone_which_is_the_trust_it_asks_for() {
        // Documented, not a bug: three of five signers can send the whole treasury to an address of their choosing.
        let mut c = treasury();
        ctx("s1.near", 11, 100);
        let id = c.propose(acct("thief.near"), NearToken::from_yoctonear(100 * NEAR));
        for (s, b) in [("s2.near", 12), ("s3.near", 13)] {
            ctx(s, b, 100);
            c.approve(id);
        }
        ctx("anyone.near", 14, 100);
        c.execute(id);
        assert_eq!(transfers(), vec![("thief.near".to_string(), 100 * NEAR)]);
    }
}
