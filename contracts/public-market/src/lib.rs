//! Deliberately plain public markets: the baselines Midge's sealed quote rounds and block-trade crosses are measured against.
//!
//! 1. Open reverse quotes (lending). A borrower's request names the loan and a maximum rate. Anyone may quote a lower rate by
//!    attaching exactly the loan; the previous best is refunded at once; every quote is public the moment it lands. After
//!    `end_block` anyone closes the request and the best lender's deposit is paid to the borrower.
//! 2. An open order book (block trade). Buyers deposit units x limit, sellers deposit nothing, and every order (side, units,
//!    limit) is public. After `end_block` anyone calls `cross`: eligible orders cross at the reference price by the same rule the
//!    sealed room uses (more aggressive limit first, then posting order), sellers are paid, buyers get back deposit minus cash.
//!
//! No operator, no sealing. Our own minimal reimplementation of the common pattern, not any other project's contract.
use near_sdk::store::LookupMap;
use near_sdk::{env, near, AccountId, NearToken, Promise};

const MICRO_YOCTO: u128 = 1_000_000_000_000_000_000; // yoctoNEAR per micro-NEAR

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Quote {
    pub quoter: AccountId,
    pub rate_bps: u32,
    pub block: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Request {
    pub borrower: AccountId,
    pub loan: NearToken,
    pub max_rate_bps: u32,
    pub end_block: u64,
    pub best_quoter: Option<AccountId>,
    pub best_rate_bps: u32,
    pub quotes: u32,
    pub settled: bool,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Order {
    pub trader: AccountId,
    pub side: String,
    pub units: u32,
    pub limit_micro: u128,
    pub block: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Book {
    pub reference_micro: u128,
    pub end_block: u64,
    pub settled: bool,
    pub matched_units: u64,
}

#[near(contract_state)]
pub struct PublicMarket {
    requests: LookupMap<String, Request>,
    quote_logs: LookupMap<String, Vec<Quote>>,
    books: LookupMap<String, Book>,
    orders: LookupMap<String, Vec<Order>>,
}

impl Default for PublicMarket {
    fn default() -> Self {
        Self {
            requests: LookupMap::new(b"r"),
            quote_logs: LookupMap::new(b"q"),
            books: LookupMap::new(b"b"),
            orders: LookupMap::new(b"o"),
        }
    }
}

#[near]
impl PublicMarket {
    // ------------------------------------------------------------------ open reverse quotes
    pub fn open_request(
        &mut self,
        request_id: String,
        borrower: AccountId,
        loan: NearToken,
        max_rate_bps: u32,
        end_block: u64,
    ) {
        assert!(self.requests.get(&request_id).is_none(), "request exists");
        assert!(
            end_block > env::block_height(),
            "end_block must be in the future"
        );
        assert!(loan.as_yoctonear() > 0, "loan must be positive");
        self.requests.insert(
            request_id.clone(),
            Request {
                borrower,
                loan,
                max_rate_bps,
                end_block,
                best_quoter: None,
                best_rate_bps: 0,
                quotes: 0,
                settled: false,
            },
        );
        self.quote_logs.insert(request_id, Vec::new());
    }

    #[payable]
    pub fn quote(&mut self, request_id: String, rate_bps: u32) {
        let who = env::predecessor_account_id();
        let amount = env::attached_deposit();
        let r = self
            .requests
            .get_mut(&request_id)
            .unwrap_or_else(|| env::panic_str("no such request"));
        assert!(env::block_height() < r.end_block, "request has ended");
        assert!(who != r.borrower, "the borrower cannot quote");
        assert!(amount == r.loan, "must attach exactly the loan");
        assert!(rate_bps <= r.max_rate_bps, "above the borrower's maximum");
        assert!(
            r.best_quoter.is_none() || rate_bps < r.best_rate_bps,
            "a quote must be lower than the best"
        );
        let previous = r.best_quoter.replace(who.clone());
        r.best_rate_bps = rate_bps;
        r.quotes += 1;
        let loan = r.loan;
        if let Some(prev) = previous {
            let _ = Promise::new(prev).transfer(loan);
        }
        if let Some(log) = self.quote_logs.get_mut(&request_id) {
            log.push(Quote {
                quoter: who,
                rate_bps,
                block: env::block_height(),
            });
        }
    }

    pub fn close_request(&mut self, request_id: String) {
        let r = self
            .requests
            .get_mut(&request_id)
            .unwrap_or_else(|| env::panic_str("no such request"));
        assert!(env::block_height() >= r.end_block, "request has not ended");
        assert!(!r.settled, "already settled");
        r.settled = true;
        if r.best_quoter.is_some() {
            let _ = Promise::new(r.borrower.clone()).transfer(r.loan);
        }
    }

    pub fn get_request(&self, request_id: String) -> Option<Request> {
        self.requests.get(&request_id).cloned()
    }

    pub fn get_quote_log(&self, request_id: String) -> Vec<Quote> {
        self.quote_logs
            .get(&request_id)
            .cloned()
            .unwrap_or_default()
    }

    // ------------------------------------------------------------------ open order book
    pub fn open_book(&mut self, book_id: String, reference_micro: u128, end_block: u64) {
        assert!(self.books.get(&book_id).is_none(), "book exists");
        assert!(
            end_block > env::block_height(),
            "end_block must be in the future"
        );
        assert!(reference_micro > 0, "reference price must be positive");
        self.books.insert(
            book_id.clone(),
            Book {
                reference_micro,
                end_block,
                settled: false,
                matched_units: 0,
            },
        );
        self.orders.insert(book_id, Vec::new());
    }

    #[payable]
    pub fn post_order(&mut self, book_id: String, side: String, units: u32, limit_micro: u128) {
        let who = env::predecessor_account_id();
        let amount = env::attached_deposit().as_yoctonear();
        let book = self
            .books
            .get(&book_id)
            .unwrap_or_else(|| env::panic_str("no such book"));
        assert!(env::block_height() < book.end_block, "book has ended");
        assert!(units > 0, "units must be positive");
        let list = self
            .orders
            .get_mut(&book_id)
            .unwrap_or_else(|| env::panic_str("no such book"));
        assert!(
            list.iter().all(|o| o.trader != who),
            "one order per account"
        );
        match side.as_str() {
            "buy" => assert!(
                amount == units as u128 * limit_micro * MICRO_YOCTO,
                "buyers deposit units x limit"
            ),
            "sell" => assert!(amount == 0, "sellers deposit nothing"),
            _ => env::panic_str("side must be buy or sell"),
        }
        list.push(Order {
            trader: who,
            side,
            units,
            limit_micro,
            block: env::block_height(),
        });
    }

    pub fn cross(&mut self, book_id: String) {
        let book = self
            .books
            .get_mut(&book_id)
            .unwrap_or_else(|| env::panic_str("no such book"));
        assert!(env::block_height() >= book.end_block, "book has not ended");
        assert!(!book.settled, "already settled");
        book.settled = true;
        let reference = book.reference_micro;
        let orders = self.orders.get(&book_id).cloned().unwrap_or_default();

        let mut buys: Vec<(usize, &Order)> = orders
            .iter()
            .enumerate()
            .filter(|(_, o)| o.side == "buy" && o.limit_micro >= reference)
            .collect();
        let mut sells: Vec<(usize, &Order)> = orders
            .iter()
            .enumerate()
            .filter(|(_, o)| o.side == "sell" && o.limit_micro <= reference)
            .collect();
        buys.sort_by(|a, b| b.1.limit_micro.cmp(&a.1.limit_micro).then(a.0.cmp(&b.0)));
        sells.sort_by(|a, b| a.1.limit_micro.cmp(&b.1.limit_micro).then(a.0.cmp(&b.0)));
        let total_buy: u64 = buys.iter().map(|(_, o)| o.units as u64).sum();
        let total_sell: u64 = sells.iter().map(|(_, o)| o.units as u64).sum();
        let matched = total_buy.min(total_sell);
        book.matched_units = matched;

        let mut buyer_fill: Vec<(AccountId, u64)> = Vec::new();
        let mut rest = matched;
        for (_, o) in &buys {
            let u = (o.units as u64).min(rest);
            rest -= u;
            buyer_fill.push((o.trader.clone(), u));
        }
        let mut rest = matched;
        for (_, o) in &sells {
            let u = (o.units as u64).min(rest);
            rest -= u;
            if u > 0 {
                let cash = u as u128 * reference * MICRO_YOCTO;
                let _ = Promise::new(o.trader.clone()).transfer(NearToken::from_yoctonear(cash));
            }
        }
        // every buyer (matched or not) gets back deposit minus cash paid, including buyers who were not eligible
        for o in orders.iter().filter(|o| o.side == "buy") {
            let deposited = o.units as u128 * o.limit_micro * MICRO_YOCTO;
            let filled = buyer_fill
                .iter()
                .find(|(a, _)| *a == o.trader)
                .map(|(_, u)| *u)
                .unwrap_or(0);
            let paid = filled as u128 * reference * MICRO_YOCTO;
            let back = deposited - paid;
            if back > 0 {
                let _ = Promise::new(o.trader.clone()).transfer(NearToken::from_yoctonear(back));
            }
        }
    }

    pub fn get_book(&self, book_id: String) -> Option<Book> {
        self.books.get(&book_id).cloned()
    }

    pub fn get_orders(&self, book_id: String) -> Vec<Order> {
        self.orders.get(&book_id).cloned().unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{get_created_receipts, VMContextBuilder};
    use near_sdk::{testing_env, AccountId, NearToken};

    const NEAR: u128 = 1_000_000_000_000_000_000_000_000;
    const MICRO: u128 = 1_000_000_000_000_000_000; // yoctoNEAR per micro-NEAR

    fn ctx(who: &str, deposit: u128, block: u64) {
        let mut b = VMContextBuilder::new();
        b.predecessor_account_id(who.parse().unwrap())
            .account_balance(NearToken::from_near(10_000))
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .block_height(block);
        testing_env!(b.build());
    }
    fn acct(s: &str) -> AccountId {
        s.parse().unwrap()
    }
    /// (receiver, amount) of every transfer created since the last testing_env!
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

    // ---------------------------------------------------------------- open reverse quotes (lending)
    fn request() -> PublicMarket {
        ctx("anyone.near", 0, 10);
        let mut c = PublicMarket::default();
        c.open_request(
            "r".into(),
            acct("bor.near"),
            NearToken::from_yoctonear(5 * NEAR),
            700,
            100,
        );
        c
    }

    #[test]
    fn the_lowest_quote_wins_and_every_quote_is_public() {
        let mut c = request();
        ctx("l1.near", 5 * NEAR, 20);
        c.quote("r".into(), 450);
        ctx("l2.near", 5 * NEAR, 21);
        c.quote("r".into(), 400);
        let r = c.get_request("r".into()).unwrap();
        assert_eq!(r.best_quoter.unwrap().as_str(), "l2.near");
        assert_eq!(r.best_rate_bps, 400);
        assert_eq!(r.quotes, 2);
        let log = c.get_quote_log("r".into());
        assert_eq!(
            log.iter().map(|q| q.rate_bps).collect::<Vec<_>>(),
            vec![450, 400]
        );
        assert_eq!(
            log.iter().map(|q| q.quoter.as_str()).collect::<Vec<_>>(),
            vec!["l1.near", "l2.near"]
        );
    }

    #[test]
    fn an_outbid_lender_is_refunded_at_once() {
        let mut c = request();
        ctx("l1.near", 5 * NEAR, 20);
        c.quote("r".into(), 450);
        ctx("l2.near", 5 * NEAR, 21);
        c.quote("r".into(), 400);
        assert_eq!(transfers(), vec![("l1.near".to_string(), 5 * NEAR)]);
    }

    #[test]
    #[should_panic(expected = "must be lower")]
    fn a_quote_must_beat_the_best() {
        let mut c = request();
        ctx("l1.near", 5 * NEAR, 20);
        c.quote("r".into(), 450);
        ctx("l2.near", 5 * NEAR, 21);
        c.quote("r".into(), 450);
    }

    #[test]
    #[should_panic(expected = "above the borrower's maximum")]
    fn a_quote_above_the_maximum_is_refused() {
        let mut c = request();
        ctx("l1.near", 5 * NEAR, 20);
        c.quote("r".into(), 701);
    }

    #[test]
    #[should_panic(expected = "must attach exactly the loan")]
    fn the_deposit_must_equal_the_loan() {
        let mut c = request();
        ctx("l1.near", 4 * NEAR, 20);
        c.quote("r".into(), 450);
    }

    #[test]
    #[should_panic(expected = "borrower cannot quote")]
    fn the_borrower_cannot_quote() {
        let mut c = request();
        ctx("bor.near", 5 * NEAR, 20);
        c.quote("r".into(), 450);
    }

    #[test]
    #[should_panic(expected = "has ended")]
    fn no_quote_after_the_end() {
        let mut c = request();
        ctx("l1.near", 5 * NEAR, 100);
        c.quote("r".into(), 450);
    }

    #[test]
    fn closing_pays_the_loan_to_the_borrower_once() {
        let mut c = request();
        ctx("l1.near", 5 * NEAR, 20);
        c.quote("r".into(), 450);
        ctx("anyone.near", 0, 100);
        c.close_request("r".into());
        assert_eq!(transfers(), vec![("bor.near".to_string(), 5 * NEAR)]);
        assert!(c.get_request("r".into()).unwrap().settled);
    }

    #[test]
    #[should_panic(expected = "already settled")]
    fn a_request_closes_only_once() {
        let mut c = request();
        ctx("l1.near", 5 * NEAR, 20);
        c.quote("r".into(), 450);
        ctx("anyone.near", 0, 100);
        c.close_request("r".into());
        c.close_request("r".into());
    }

    #[test]
    #[should_panic(expected = "has not ended")]
    fn a_request_cannot_close_early() {
        let mut c = request();
        ctx("anyone.near", 0, 50);
        c.close_request("r".into());
    }

    // ---------------------------------------------------------------- open order book (block trade)
    fn book() -> PublicMarket {
        ctx("anyone.near", 0, 10);
        let mut c = PublicMarket::default();
        c.open_book("b".into(), 1_000_000, 100); // reference price 1.0 NEAR per unit
        c
    }
    fn buy(c: &mut PublicMarket, who: &str, units: u32, limit_micro: u128, block: u64) {
        ctx(who, units as u128 * limit_micro * MICRO, block);
        c.post_order("b".into(), "buy".into(), units, limit_micro);
    }
    fn sell(c: &mut PublicMarket, who: &str, units: u32, limit_micro: u128, block: u64) {
        ctx(who, 0, block);
        c.post_order("b".into(), "sell".into(), units, limit_micro);
    }
    fn example() -> PublicMarket {
        let mut c = book();
        buy(&mut c, "b1.near", 100, 1_100_000, 20);
        buy(&mut c, "b2.near", 50, 1_050_000, 21);
        sell(&mut c, "s1.near", 80, 950_000, 22);
        sell(&mut c, "s2.near", 90, 1_000_000, 23);
        c
    }

    #[test]
    fn every_order_is_public_with_its_size_side_and_limit() {
        let c = example();
        let o = c.get_orders("b".into());
        assert_eq!(o.len(), 4);
        assert_eq!(
            (
                o[0].trader.as_str(),
                o[0].side.as_str(),
                o[0].units,
                o[0].limit_micro
            ),
            ("b1.near", "buy", 100, 1_100_000)
        );
        assert_eq!(
            (
                o[3].trader.as_str(),
                o[3].side.as_str(),
                o[3].units,
                o[3].limit_micro
            ),
            ("s2.near", "sell", 90, 1_000_000)
        );
    }

    #[test]
    fn the_cross_matches_the_overlap_and_refunds_the_rest() {
        let mut c = example();
        ctx("anyone.near", 0, 100);
        c.cross("b".into());
        let t = transfers();
        // sellers: s1 80, s2 70 units at 1.0
        assert!(t.contains(&("s1.near".to_string(), 80 * NEAR)));
        assert!(t.contains(&("s2.near".to_string(), 70 * NEAR)));
        // buyers had deposited units x limit; each is refunded deposit minus fill x reference
        assert!(t.contains(&("b1.near".to_string(), 100 * 1_100_000 * MICRO - 100 * NEAR)));
        assert!(t.contains(&("b2.near".to_string(), 50 * 1_050_000 * MICRO - 50 * NEAR)));
        let b = c.get_book("b".into()).unwrap();
        assert!(b.settled);
        assert_eq!(b.matched_units, 150);
    }

    #[test]
    fn with_no_overlap_every_buyer_is_refunded_in_full() {
        let mut c = book();
        buy(&mut c, "b1.near", 10, 900_000, 20);
        sell(&mut c, "s1.near", 10, 1_200_000, 21);
        ctx("anyone.near", 0, 100);
        c.cross("b".into());
        assert_eq!(
            transfers(),
            vec![("b1.near".to_string(), 10 * 900_000 * MICRO)]
        );
        assert_eq!(c.get_book("b".into()).unwrap().matched_units, 0);
    }

    #[test]
    fn a_buyer_below_the_reference_does_not_trade_even_against_an_eager_seller() {
        let mut c = book();
        buy(&mut c, "b1.near", 10, 900_000, 20); // limit below the 1.0 reference
        sell(&mut c, "s1.near", 10, 800_000, 21); // willing seller
        ctx("anyone.near", 0, 100);
        c.cross("b".into());
        assert_eq!(c.get_book("b".into()).unwrap().matched_units, 0);
        assert_eq!(
            transfers(),
            vec![("b1.near".to_string(), 10 * 900_000 * MICRO)]
        );
    }

    #[test]
    fn the_more_aggressive_buyer_fills_first_when_sellers_run_out() {
        let mut c = book();
        buy(&mut c, "low.near", 100, 1_050_000, 20); // posted first, less aggressive
        buy(&mut c, "high.near", 100, 1_100_000, 21);
        sell(&mut c, "s1.near", 100, 900_000, 22);
        ctx("anyone.near", 0, 100);
        c.cross("b".into());
        let t = transfers();
        assert!(t.contains(&("s1.near".to_string(), 100 * NEAR)));
        // high filled in full: refunded 100 x 1.10 - 100 x 1.0; low filled nothing: refunded its whole deposit
        assert!(t.contains(&(
            "high.near".to_string(),
            100 * 1_100_000 * MICRO - 100 * NEAR
        )));
        assert!(t.contains(&("low.near".to_string(), 100 * 1_050_000 * MICRO)));
    }

    #[test]
    fn equally_aggressive_orders_fill_in_posting_order() {
        let mut c = book();
        buy(&mut c, "first.near", 60, 1_000_000, 20);
        buy(&mut c, "second.near", 60, 1_000_000, 21);
        sell(&mut c, "s1.near", 80, 1_000_000, 22);
        ctx("anyone.near", 0, 100);
        c.cross("b".into());
        let t = transfers();
        assert!(!t.iter().any(|(a, _)| a == "first.near")); // first filled in full (60 x 1.0 = its deposit): nothing to refund
        assert!(t.contains(&("second.near".to_string(), 40 * NEAR))); // second got 20 of 60: refunded 40
    }

    #[test]
    #[should_panic(expected = "buyers deposit units x limit")]
    fn a_buy_order_must_deposit_units_times_limit() {
        let mut c = book();
        ctx("b1.near", 5 * NEAR, 20);
        c.post_order("b".into(), "buy".into(), 10, 1_000_000);
    }

    #[test]
    #[should_panic(expected = "sellers deposit nothing")]
    fn a_sell_order_attaches_no_deposit() {
        let mut c = book();
        ctx("s1.near", NEAR, 20);
        c.post_order("b".into(), "sell".into(), 10, 1_000_000);
    }

    #[test]
    #[should_panic(expected = "one order per account")]
    fn one_order_per_account() {
        let mut c = book();
        buy(&mut c, "b1.near", 10, 1_000_000, 20);
        buy(&mut c, "b1.near", 10, 1_000_000, 21);
    }

    #[test]
    #[should_panic(expected = "has not ended")]
    fn the_book_cannot_cross_early() {
        let mut c = example();
        ctx("anyone.near", 0, 50);
        c.cross("b".into());
    }

    #[test]
    #[should_panic(expected = "already settled")]
    fn the_book_crosses_only_once() {
        let mut c = example();
        ctx("anyone.near", 0, 100);
        c.cross("b".into());
        c.cross("b".into());
    }
}
