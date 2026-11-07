//! A deliberately plain public auction: the baseline Midge's sealed auctions are measured against.
//!
//! One lot per auction. Anyone can bid by attaching NEAR; the bid is the attached amount and is public the moment it lands.
//! A bid must beat the highest by at least 1% (and at least the reserve). The previous highest bidder is refunded at once.
//! After `end_block` anyone can close the auction and the highest bid is paid to the seller. No operator, no sealing,
//! no anti-sniping extension: this is how most on-chain auctions work today. It is our own minimal reimplementation of that
//! pattern, not any other project's contract.
use near_sdk::store::LookupMap;
use near_sdk::{env, near, AccountId, NearToken, Promise};

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Auction {
    pub seller: AccountId,
    pub end_block: u64,
    pub reserve: NearToken,
    pub high_bidder: Option<AccountId>,
    pub high_bid: NearToken,
    pub bids: u32,
    pub settled: bool,
}

#[near(contract_state)]
pub struct PublicAuction {
    auctions: LookupMap<String, Auction>,
}

impl Default for PublicAuction {
    fn default() -> Self {
        Self {
            auctions: LookupMap::new(b"a"),
        }
    }
}

#[near]
impl PublicAuction {
    pub fn create(
        &mut self,
        auction_id: String,
        seller: AccountId,
        end_block: u64,
        reserve: NearToken,
    ) {
        assert!(self.auctions.get(&auction_id).is_none(), "auction exists");
        assert!(
            end_block > env::block_height(),
            "end_block must be in the future"
        );
        self.auctions.insert(
            auction_id,
            Auction {
                seller,
                end_block,
                reserve,
                high_bidder: None,
                high_bid: NearToken::from_yoctonear(0),
                bids: 0,
                settled: false,
            },
        );
    }

    #[payable]
    pub fn bid(&mut self, auction_id: String) {
        let who = env::predecessor_account_id();
        let amount = env::attached_deposit();
        let a = self
            .auctions
            .get_mut(&auction_id)
            .unwrap_or_else(|| env::panic_str("no such auction"));
        assert!(env::block_height() < a.end_block, "auction has ended");
        assert!(amount >= a.reserve, "below the reserve");
        let min = a.high_bid.as_yoctonear() + (a.high_bid.as_yoctonear() / 100).max(1);
        assert!(
            a.high_bidder.is_none() || amount.as_yoctonear() >= min,
            "must beat the highest bid by 1%"
        );
        let previous = a.high_bidder.replace(who);
        let refund = a.high_bid;
        a.high_bid = amount;
        a.bids += 1;
        if let Some(prev) = previous {
            let _ = Promise::new(prev).transfer(refund);
        }
    }

    pub fn close(&mut self, auction_id: String) {
        let a = self
            .auctions
            .get_mut(&auction_id)
            .unwrap_or_else(|| env::panic_str("no such auction"));
        assert!(env::block_height() >= a.end_block, "auction has not ended");
        assert!(!a.settled, "already settled");
        a.settled = true;
        if a.high_bidder.is_some() {
            let _ = Promise::new(a.seller.clone()).transfer(a.high_bid);
        }
    }

    pub fn get_auction(&self, auction_id: String) -> Option<Auction> {
        self.auctions.get(&auction_id).cloned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn ctx(who: &str, deposit: u128, block: u64) {
        let mut b = VMContextBuilder::new();
        b.predecessor_account_id(who.parse().unwrap())
            .attached_deposit(NearToken::from_millinear(deposit))
            .block_height(block);
        testing_env!(b.build());
    }

    fn new_auction() -> PublicAuction {
        ctx("s.near", 0, 10);
        let mut c = PublicAuction::default();
        c.create(
            "a".into(),
            "s.near".parse().unwrap(),
            100,
            NearToken::from_millinear(10),
        );
        c
    }

    #[test]
    fn the_highest_bid_wins_and_is_visible() {
        let mut c = new_auction();
        ctx("a.near", 20, 20);
        c.bid("a".into());
        ctx("b.near", 30, 21);
        c.bid("a".into());
        let a = c.get_auction("a".into()).unwrap();
        assert_eq!(a.high_bidder.unwrap().as_str(), "b.near");
        assert_eq!(a.high_bid, NearToken::from_millinear(30));
        assert_eq!(a.bids, 2);
    }

    #[test]
    #[should_panic(expected = "below the reserve")]
    fn a_bid_under_the_reserve_is_refused() {
        let mut c = new_auction();
        ctx("a.near", 5, 20);
        c.bid("a".into());
    }

    #[test]
    #[should_panic(expected = "must beat the highest bid by 1%")]
    fn a_bid_that_does_not_beat_the_highest_is_refused() {
        let mut c = new_auction();
        ctx("a.near", 20, 20);
        c.bid("a".into());
        ctx("b.near", 20, 21);
        c.bid("a".into());
    }

    #[test]
    #[should_panic(expected = "auction has not ended")]
    fn it_cannot_be_closed_early() {
        let mut c = new_auction();
        ctx("a.near", 20, 20);
        c.bid("a".into());
        ctx("x.near", 0, 50);
        c.close("a".into());
    }

    #[test]
    #[should_panic(expected = "auction has ended")]
    fn it_takes_no_bids_after_the_end() {
        let mut c = new_auction();
        ctx("a.near", 20, 100);
        c.bid("a".into());
    }

    #[test]
    #[should_panic(expected = "already settled")]
    fn it_pays_out_once() {
        let mut c = new_auction();
        ctx("a.near", 20, 20);
        c.bid("a".into());
        ctx("x.near", 0, 100);
        c.close("a".into());
        c.close("a".into());
    }
}
