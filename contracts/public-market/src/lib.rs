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
    pub max_units: u32,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct PollOption {
    pub id: String,
    pub recipient: AccountId,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Poll {
    pub options: Vec<PollOption>,
    pub roll: Vec<AccountId>,
    pub share: NearToken,
    pub quorum_bps: u32,
    pub rule: String,
    pub end_block: u64,
    pub joined: Vec<AccountId>,
    pub settled: bool,
    pub decided: bool,
    pub winner: Option<String>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Rfq {
    pub taker: AccountId,
    pub side: String,
    pub units: u32,
    pub limit_micro: u128,
    pub end_block: u64,
    pub best_maker: Option<AccountId>,
    pub best_price_micro: u128,
    pub quotes: u32,
    pub settled: bool,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct RfqQuote {
    pub maker: AccountId,
    pub price_micro: u128,
    pub block: u64,
}

#[near(contract_state)]
pub struct PublicMarket {
    requests: LookupMap<String, Request>,
    quote_logs: LookupMap<String, Vec<Quote>>,
    books: LookupMap<String, Book>,
    orders: LookupMap<String, Vec<Order>>,
    polls: LookupMap<String, Poll>,
    votes: LookupMap<String, Vec<(AccountId, String)>>,
    rfqs: LookupMap<String, Rfq>,
    rfq_quotes: LookupMap<String, Vec<RfqQuote>>,
}

impl Default for PublicMarket {
    fn default() -> Self {
        Self {
            requests: LookupMap::new(b"r"),
            quote_logs: LookupMap::new(b"q"),
            books: LookupMap::new(b"b"),
            orders: LookupMap::new(b"o"),
            polls: LookupMap::new(b"v"),
            votes: LookupMap::new(b"w"),
            rfqs: LookupMap::new(b"f"),
            rfq_quotes: LookupMap::new(b"g"),
        }
    }
}

#[near]
#[allow(clippy::too_many_arguments)]
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
    pub fn open_book(
        &mut self,
        book_id: String,
        reference_micro: u128,
        end_block: u64,
        max_units: u32,
    ) {
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
                max_units,
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

    /// Pro-rata cross, the same rule as the sealed room. The limit decides only who qualifies (buyers at or above the
    /// reference, sellers at or below it); matched units are the smaller side's total; the short side is filled in full and
    /// the long side in proportion to size, largest remainder first, ties to posting order. `max_units` (0 = none) clamps any
    /// one order's size. Sellers are paid fill x reference; every buyer gets back deposit minus cash paid.
    pub fn cross(&mut self, book_id: String) {
        let book = self
            .books
            .get_mut(&book_id)
            .unwrap_or_else(|| env::panic_str("no such book"));
        assert!(env::block_height() >= book.end_block, "book has not ended");
        assert!(!book.settled, "already settled");
        book.settled = true;
        let reference = book.reference_micro;
        let cap = if book.max_units == 0 {
            u64::MAX
        } else {
            book.max_units as u64
        };
        let orders = self.orders.get(&book_id).cloned().unwrap_or_default();

        // (posting index, trader, clamped units)
        let take = |side: &str, ok: &dyn Fn(&Order) -> bool| -> Vec<(usize, AccountId, u64)> {
            orders
                .iter()
                .enumerate()
                .filter(|(_, o)| o.side == side && o.units > 0 && ok(o))
                .map(|(i, o)| (i, o.trader.clone(), (o.units as u64).min(cap)))
                .collect()
        };
        let buys = take("buy", &|o| o.limit_micro >= reference);
        let sells = take("sell", &|o| o.limit_micro <= reference);
        let total_buy: u64 = buys.iter().map(|b| b.2).sum();
        let total_sell: u64 = sells.iter().map(|s| s.2).sum();
        let matched = total_buy.min(total_sell);
        book.matched_units = matched;

        let fill = |list: &Vec<(usize, AccountId, u64)>, total: u64| -> Vec<(AccountId, u64)> {
            if matched == 0 {
                return Vec::new();
            }
            if total == matched {
                return list.iter().map(|(_, a, u)| (a.clone(), *u)).collect();
            }
            let mut units: Vec<u64> = list
                .iter()
                .map(|(_, _, u)| ((*u as u128 * matched as u128) / total as u128) as u64)
                .collect();
            let mut rest = matched - units.iter().sum::<u64>();
            let mut by_rem: Vec<(usize, u128)> = list
                .iter()
                .enumerate()
                .map(|(k, (_, _, u))| (k, (*u as u128 * matched as u128) % total as u128))
                .collect();
            by_rem.sort_by(|a, b| b.1.cmp(&a.1).then(list[a.0].0.cmp(&list[b.0].0)));
            for (k, _) in by_rem {
                if rest == 0 {
                    break;
                }
                units[k] += 1;
                rest -= 1;
            }
            list.iter()
                .zip(units)
                .map(|((_, a, _), u)| (a.clone(), u))
                .collect()
        };
        let buyer_fills = fill(&buys, total_buy);
        let seller_fills = fill(&sells, total_sell);

        for (seller, u) in &seller_fills {
            if *u > 0 {
                let cash = *u as u128 * reference * MICRO_YOCTO;
                let _ = Promise::new(seller.clone()).transfer(NearToken::from_yoctonear(cash));
            }
        }
        // every buyer (matched or not) gets back deposit minus cash paid, including buyers who did not qualify
        for o in orders.iter().filter(|o| o.side == "buy") {
            let deposited = o.units as u128 * o.limit_micro * MICRO_YOCTO;
            let filled = buyer_fills
                .iter()
                .find(|(a, _)| *a == o.trader)
                .map(|(_, u)| *u)
                .unwrap_or(0);
            let back = deposited - filled as u128 * reference * MICRO_YOCTO;
            if back > 0 {
                let _ = Promise::new(o.trader.clone()).transfer(NearToken::from_yoctonear(back));
            }
        }
    }

    // ------------------------------------------------------------------ open poll (voting)
    /// An open vote: every roll member deposits `share`, votes in public (a later vote replaces an earlier one), and after
    /// `end_block` anyone closes it. Counting is the sealed room's rule: one latest vote per member, a quorum over the whole roll,
    /// abstentions count toward the quorum but not the majority, a strict leader (and more than half of the non-abstaining votes
    /// under "majority") wins. If decided the whole pool goes to the winner's recipient; otherwise every deposit is refunded.
    #[allow(clippy::too_many_arguments)]
    pub fn open_poll(
        &mut self,
        poll_id: String,
        options: Vec<PollOption>,
        roll: Vec<AccountId>,
        share: NearToken,
        quorum_bps: u32,
        rule: String,
        end_block: u64,
    ) {
        assert!(self.polls.get(&poll_id).is_none(), "poll exists");
        assert!(
            end_block > env::block_height(),
            "end_block must be in the future"
        );
        assert!(options.len() >= 2, "a poll needs at least two options");
        assert!(
            rule == "majority" || rule == "plurality",
            "rule must be majority or plurality"
        );
        assert!(quorum_bps <= 10_000, "quorum_bps is at most 10000");
        self.polls.insert(
            poll_id.clone(),
            Poll {
                options,
                roll,
                share,
                quorum_bps,
                rule,
                end_block,
                joined: Vec::new(),
                settled: false,
                decided: false,
                winner: None,
            },
        );
        self.votes.insert(poll_id, Vec::new());
    }

    #[payable]
    pub fn join_poll(&mut self, poll_id: String) {
        let who = env::predecessor_account_id();
        let amount = env::attached_deposit();
        let poll = self
            .polls
            .get_mut(&poll_id)
            .unwrap_or_else(|| env::panic_str("no such poll"));
        assert!(env::block_height() < poll.end_block, "poll has ended");
        assert!(poll.roll.contains(&who), "only the roll can join");
        assert!(!poll.joined.contains(&who), "already joined");
        assert!(amount == poll.share, "must deposit exactly the share");
        poll.joined.push(who);
    }

    pub fn vote(&mut self, poll_id: String, choice: String) {
        let who = env::predecessor_account_id();
        let poll = self
            .polls
            .get(&poll_id)
            .unwrap_or_else(|| env::panic_str("no such poll"));
        assert!(env::block_height() < poll.end_block, "poll has ended");
        assert!(
            poll.joined.contains(&who),
            "only a member who joined can vote"
        );
        assert!(
            choice == "abstain" || poll.options.iter().any(|o| o.id == choice),
            "unknown option"
        );
        let list = self
            .votes
            .get_mut(&poll_id)
            .unwrap_or_else(|| env::panic_str("no such poll"));
        match list.iter_mut().find(|(a, _)| *a == who) {
            Some(entry) => entry.1 = choice,
            None => list.push((who, choice)),
        }
    }

    pub fn close_poll(&mut self, poll_id: String) {
        let poll = self
            .polls
            .get_mut(&poll_id)
            .unwrap_or_else(|| env::panic_str("no such poll"));
        assert!(env::block_height() >= poll.end_block, "poll has not ended");
        assert!(!poll.settled, "already settled");
        poll.settled = true;
        let votes = self.votes.get(&poll_id).cloned().unwrap_or_default();
        let cast = votes.len() as u64;
        let quorum_met = cast * 10_000 >= poll.quorum_bps as u64 * poll.roll.len() as u64;
        let mut winner: Option<String> = None;
        if quorum_met {
            let counts: Vec<(String, u64)> = poll
                .options
                .iter()
                .map(|o| {
                    (
                        o.id.clone(),
                        votes.iter().filter(|(_, c)| *c == o.id).count() as u64,
                    )
                })
                .collect();
            let non_abstain: u64 = counts.iter().map(|(_, n)| *n).sum();
            let top = counts.iter().map(|(_, n)| *n).max().unwrap_or(0);
            let leaders: Vec<&(String, u64)> = counts.iter().filter(|(_, n)| *n == top).collect();
            if non_abstain > 0
                && leaders.len() == 1
                && (poll.rule == "plurality" || top * 2 > non_abstain)
            {
                winner = Some(leaders[0].0.clone());
            }
        }
        poll.decided = winner.is_some();
        poll.winner = winner.clone();
        match winner {
            Some(w) => {
                let recipient = poll
                    .options
                    .iter()
                    .find(|o| o.id == w)
                    .map(|o| o.recipient.clone())
                    .unwrap_or_else(|| env::panic_str("winner has no recipient"));
                let pool = poll.share.as_yoctonear() * poll.joined.len() as u128;
                let _ = Promise::new(recipient).transfer(NearToken::from_yoctonear(pool));
            }
            None => {
                for m in poll.joined.clone() {
                    let _ = Promise::new(m).transfer(poll.share);
                }
            }
        }
    }

    pub fn get_poll(&self, poll_id: String) -> Option<Poll> {
        self.polls.get(&poll_id).cloned()
    }

    pub fn get_votes(&self, poll_id: String) -> Vec<(AccountId, String)> {
        self.votes.get(&poll_id).cloned().unwrap_or_default()
    }

    // ------------------------------------------------------------------ open RFQ (taker and makers)
    /// An open request for quote. The taker (the caller) states the side, size and limit IN PUBLIC. A buy RFQ goes to the lowest
    /// ask at or under the limit; the taker escrows units x limit. A sell RFQ goes to the highest bid at or over the limit; each
    /// maker escrows units x price and an outbid maker is refunded at once. After `end_block` anyone closes it: the winner is paid
    /// (buy) or the taker is paid from the winner's escrow (sell), the unspent part of a buyer's escrow is returned.
    #[payable]
    pub fn open_rfq(
        &mut self,
        rfq_id: String,
        side: String,
        units: u32,
        limit_micro: u128,
        end_block: u64,
    ) {
        let taker = env::predecessor_account_id();
        let attached = env::attached_deposit().as_yoctonear();
        assert!(self.rfqs.get(&rfq_id).is_none(), "rfq exists");
        assert!(
            end_block > env::block_height(),
            "end_block must be in the future"
        );
        assert!(
            units > 0 && limit_micro > 0,
            "units and limit must be positive"
        );
        match side.as_str() {
            "buy" => assert!(
                attached == units as u128 * limit_micro * MICRO_YOCTO,
                "buyers deposit units x limit"
            ),
            "sell" => assert!(attached == 0, "sellers deposit nothing"),
            _ => env::panic_str("side must be buy or sell"),
        }
        self.rfqs.insert(
            rfq_id.clone(),
            Rfq {
                taker,
                side,
                units,
                limit_micro,
                end_block,
                best_maker: None,
                best_price_micro: 0,
                quotes: 0,
                settled: false,
            },
        );
        self.rfq_quotes.insert(rfq_id, Vec::new());
    }

    #[payable]
    pub fn rfq_quote(&mut self, rfq_id: String, price_micro: u128) {
        let maker = env::predecessor_account_id();
        let attached = env::attached_deposit().as_yoctonear();
        let r = self
            .rfqs
            .get_mut(&rfq_id)
            .unwrap_or_else(|| env::panic_str("no such rfq"));
        assert!(env::block_height() < r.end_block, "rfq has ended");
        assert!(maker != r.taker, "the taker cannot quote");
        assert!(price_micro > 0, "price must be positive");
        let buy = r.side == "buy";
        if buy {
            assert!(price_micro <= r.limit_micro, "above the taker's limit");
            assert!(attached == 0, "a buy maker attaches nothing");
        } else {
            assert!(price_micro >= r.limit_micro, "below the taker's limit");
            assert!(
                attached == r.units as u128 * price_micro * MICRO_YOCTO,
                "a sell maker must attach units x price"
            );
        }
        assert!(
            r.best_maker.is_none()
                || (buy && price_micro < r.best_price_micro)
                || (!buy && price_micro > r.best_price_micro),
            "a quote must improve on the best"
        );
        let previous = r.best_maker.replace(maker.clone());
        let previous_price = r.best_price_micro;
        r.best_price_micro = price_micro;
        r.quotes += 1;
        let units = r.units;
        if !buy {
            if let Some(prev) = previous {
                let refund = units as u128 * previous_price * MICRO_YOCTO;
                let _ = Promise::new(prev).transfer(NearToken::from_yoctonear(refund));
            }
        }
        if let Some(log) = self.rfq_quotes.get_mut(&rfq_id) {
            log.push(RfqQuote {
                maker,
                price_micro,
                block: env::block_height(),
            });
        }
    }

    pub fn close_rfq(&mut self, rfq_id: String) {
        let r = self
            .rfqs
            .get_mut(&rfq_id)
            .unwrap_or_else(|| env::panic_str("no such rfq"));
        assert!(env::block_height() >= r.end_block, "rfq has not ended");
        assert!(!r.settled, "already settled");
        r.settled = true;
        let notional = |p: u128| NearToken::from_yoctonear(r.units as u128 * p * MICRO_YOCTO);
        if r.side == "buy" {
            let escrow = r.units as u128 * r.limit_micro * MICRO_YOCTO;
            let cost = r.units as u128 * r.best_price_micro * MICRO_YOCTO;
            match &r.best_maker {
                Some(w) => {
                    let _ = Promise::new(w.clone()).transfer(notional(r.best_price_micro));
                    if escrow > cost {
                        let _ = Promise::new(r.taker.clone())
                            .transfer(NearToken::from_yoctonear(escrow - cost));
                    }
                }
                None => {
                    let _ =
                        Promise::new(r.taker.clone()).transfer(NearToken::from_yoctonear(escrow));
                }
            }
        } else if r.best_maker.is_some() {
            let _ = Promise::new(r.taker.clone()).transfer(notional(r.best_price_micro));
        }
    }

    pub fn get_rfq(&self, rfq_id: String) -> Option<Rfq> {
        self.rfqs.get(&rfq_id).cloned()
    }

    pub fn get_rfq_quotes(&self, rfq_id: String) -> Vec<RfqQuote> {
        self.rfq_quotes.get(&rfq_id).cloned().unwrap_or_default()
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
        c.open_book("b".into(), 1_000_000, 100, 0); // reference price 1.0 NEAR per unit, no cap
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
        // sellers fill pro-rata with largest remainder: s1 71 (70.59), s2 79 (79.41), at 1.0
        assert!(t.contains(&("s1.near".to_string(), 71 * NEAR)));
        assert!(t.contains(&("s2.near".to_string(), 79 * NEAR)));
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
    fn a_seller_above_the_reference_does_not_trade_even_against_an_eager_buyer() {
        let mut c = book();
        buy(&mut c, "b1.near", 10, 1_200_000, 20);
        sell(&mut c, "s1.near", 10, 1_100_000, 21); // asks more than the 1.0 reference
        ctx("anyone.near", 0, 100);
        c.cross("b".into());
        assert_eq!(c.get_book("b".into()).unwrap().matched_units, 0);
        assert_eq!(
            transfers(),
            vec![("b1.near".to_string(), 10 * 1_200_000 * MICRO)]
        );
    }

    #[test]
    fn an_extreme_limit_buys_no_queue_position() {
        let mut c = book();
        buy(&mut c, "low.near", 100, 1_050_000, 20);
        buy(&mut c, "high.near", 100, 1_900_000, 21); // an extreme limit, posted second
        sell(&mut c, "s1.near", 100, 900_000, 22);
        ctx("anyone.near", 0, 100);
        c.cross("b".into());
        let t = transfers();
        assert!(t.contains(&("s1.near".to_string(), 100 * NEAR)));
        // the long side (buyers, 200 units for 100 matched) is split evenly whatever the limits: 50 each
        assert!(t.contains(&("high.near".to_string(), 100 * 1_900_000 * MICRO - 50 * NEAR)));
        assert!(t.contains(&("low.near".to_string(), 100 * 1_050_000 * MICRO - 50 * NEAR)));
    }

    #[test]
    fn a_seller_with_an_extreme_limit_is_filled_pro_rata_not_first() {
        let mut c = example();
        ctx("f.near", 0, 90);
        c.post_order("b".into(), "sell".into(), 40, 10); // limit 0.00001: as aggressive as it gets
        ctx("anyone.near", 0, 100);
        c.cross("b".into());
        let t = transfers();
        // sell units 80 + 90 + 40 = 210 for 150 matched: s1 57, s2 64, f 29 (not f 40 first)
        assert!(t.contains(&("s1.near".to_string(), 57 * NEAR)));
        assert!(t.contains(&("s2.near".to_string(), 64 * NEAR)));
        assert!(t.contains(&("f.near".to_string(), 29 * NEAR)));
    }

    #[test]
    fn equal_remainders_go_to_the_earlier_order() {
        let mut c = book();
        buy(&mut c, "first.near", 10, 1_000_000, 20);
        buy(&mut c, "second.near", 10, 1_000_000, 21);
        sell(&mut c, "s1.near", 15, 1_000_000, 22);
        ctx("anyone.near", 0, 100);
        c.cross("b".into());
        let t = transfers();
        assert!(t.contains(&("s1.near".to_string(), 15 * NEAR)));
        // each buyer is owed 7.5 of 15; the extra unit goes to the first: first 8, second 7
        assert!(t.contains(&("second.near".to_string(), 3 * NEAR))); // deposited 10, paid 7
        assert!(t.contains(&("first.near".to_string(), 2 * NEAR))); // deposited 10, paid 8
    }

    #[test]
    fn the_per_order_cap_clamps_an_inflated_order() {
        ctx("anyone.near", 0, 10);
        let mut c = PublicMarket::default();
        c.open_book("b".into(), 1_000_000, 100, 100); // cap of 100 units
        buy(&mut c, "b1.near", 1_000, 1_000_000, 20); // asks for 1,000 but counts as 100
        sell(&mut c, "s1.near", 400, 1_000_000, 21); // counts as 100
        ctx("anyone.near", 0, 100);
        c.cross("b".into());
        let t = transfers();
        assert!(t.contains(&("s1.near".to_string(), 100 * NEAR)));
        // b1 deposited 1,000 x 1.0 and pays for 100: refunded 900
        assert!(t.contains(&("b1.near".to_string(), 900 * NEAR)));
        assert_eq!(c.get_book("b".into()).unwrap().matched_units, 100);
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

    // ---------------------------------------------------------------- open poll (voting)
    fn roll() -> Vec<AccountId> {
        ["m1.near", "m2.near", "m3.near", "m4.near", "m5.near"]
            .iter()
            .map(|s| acct(s))
            .collect()
    }
    fn options() -> Vec<PollOption> {
        vec![
            PollOption {
                id: "A".into(),
                recipient: acct("ra.near"),
            },
            PollOption {
                id: "B".into(),
                recipient: acct("rb.near"),
            },
            PollOption {
                id: "C".into(),
                recipient: acct("rc.near"),
            },
        ]
    }
    const SHARE: u128 = 20_000_000_000_000_000_000_000; // 0.02 NEAR
    fn poll(quorum_bps: u32, rule: &str) -> PublicMarket {
        ctx("anyone.near", 0, 10);
        let mut c = PublicMarket::default();
        c.open_poll(
            "p".into(),
            options(),
            roll(),
            NearToken::from_yoctonear(SHARE),
            quorum_bps,
            rule.into(),
            100,
        );
        for (i, m) in roll().iter().enumerate() {
            ctx(m.as_str(), SHARE, 20 + i as u64);
            c.join_poll("p".into());
        }
        c
    }
    fn vote(c: &mut PublicMarket, who: &str, choice: &str, block: u64) {
        ctx(who, 0, block);
        c.vote("p".into(), choice.into());
    }

    #[test]
    fn every_vote_is_public_with_the_voter_and_the_choice() {
        let mut c = poll(5000, "majority");
        vote(&mut c, "m1.near", "A", 30);
        vote(&mut c, "m2.near", "B", 31);
        let v = c.get_votes("p".into());
        assert_eq!(v.len(), 2);
        assert_eq!((v[0].0.as_str(), v[0].1.as_str()), ("m1.near", "A"));
        assert_eq!((v[1].0.as_str(), v[1].1.as_str()), ("m2.near", "B"));
    }

    #[test]
    fn the_tally_before_the_last_vote_is_public_so_the_last_voter_knows_they_are_pivotal() {
        let mut c = poll(5000, "majority");
        for (i, (m, ch)) in [
            ("m1.near", "A"),
            ("m2.near", "A"),
            ("m3.near", "B"),
            ("m4.near", "B"),
        ]
        .iter()
        .enumerate()
        {
            vote(&mut c, m, ch, 30 + i as u64);
        }
        let v = c.get_votes("p".into());
        let a = v.iter().filter(|x| x.1 == "A").count();
        let b = v.iter().filter(|x| x.1 == "B").count();
        assert_eq!((a, b), (2, 2)); // the fifth voter reads this and knows their vote decides
    }

    #[test]
    fn a_later_vote_replaces_an_earlier_one() {
        let mut c = poll(5000, "majority");
        vote(&mut c, "m1.near", "A", 30);
        vote(&mut c, "m1.near", "B", 31);
        let v = c.get_votes("p".into());
        assert_eq!(v.len(), 1);
        assert_eq!(v[0].1, "B");
    }

    #[test]
    fn a_decided_poll_pays_the_pool_to_the_winner() {
        let mut c = poll(5000, "majority");
        for (i, (m, ch)) in [
            ("m1.near", "A"),
            ("m2.near", "A"),
            ("m3.near", "A"),
            ("m4.near", "B"),
            ("m5.near", "abstain"),
        ]
        .iter()
        .enumerate()
        {
            vote(&mut c, m, ch, 30 + i as u64);
        }
        ctx("anyone.near", 0, 100);
        c.close_poll("p".into());
        assert_eq!(transfers(), vec![("ra.near".to_string(), 5 * SHARE)]);
        let p = c.get_poll("p".into()).unwrap();
        assert!(p.settled && p.decided);
        assert_eq!(p.winner.unwrap(), "A");
    }

    #[test]
    fn a_tie_decides_nothing_and_every_deposit_is_refunded() {
        let mut c = poll(5000, "majority");
        for (i, (m, ch)) in [
            ("m1.near", "A"),
            ("m2.near", "A"),
            ("m3.near", "B"),
            ("m4.near", "B"),
            ("m5.near", "abstain"),
        ]
        .iter()
        .enumerate()
        {
            vote(&mut c, m, ch, 30 + i as u64);
        }
        ctx("anyone.near", 0, 100);
        c.close_poll("p".into());
        let t = transfers();
        assert_eq!(t.len(), 5);
        assert!(t.iter().all(|(_, a)| *a == SHARE));
        assert!(!c.get_poll("p".into()).unwrap().decided);
    }

    #[test]
    fn a_missed_quorum_refunds_everyone() {
        let mut c = poll(6000, "majority"); // needs 3 of 5
        vote(&mut c, "m1.near", "A", 30);
        vote(&mut c, "m2.near", "A", 31);
        ctx("anyone.near", 0, 100);
        c.close_poll("p".into());
        assert_eq!(transfers().len(), 5);
        assert!(!c.get_poll("p".into()).unwrap().decided);
    }

    #[test]
    fn abstentions_count_toward_quorum_but_not_the_majority() {
        let mut c = poll(5000, "majority");
        for (i, (m, ch)) in [
            ("m1.near", "A"),
            ("m2.near", "A"),
            ("m3.near", "B"),
            ("m4.near", "abstain"),
            ("m5.near", "abstain"),
        ]
        .iter()
        .enumerate()
        {
            vote(&mut c, m, ch, 30 + i as u64);
        }
        ctx("anyone.near", 0, 100);
        c.close_poll("p".into());
        // A has 2 of the 3 non-abstaining ballots: more than half, so it wins
        assert_eq!(transfers(), vec![("ra.near".to_string(), 5 * SHARE)]);
    }

    #[test]
    fn a_missed_majority_refunds_everyone_but_a_plurality_would_have_decided() {
        let ballots = [
            ("m1.near", "A"),
            ("m2.near", "A"),
            ("m3.near", "B"),
            ("m4.near", "C"),
            ("m5.near", "abstain"),
        ];
        let mut c = poll(5000, "majority"); // A has 2 of 4 non-abstaining: not more than half
        for (i, (m, ch)) in ballots.iter().enumerate() {
            vote(&mut c, m, ch, 30 + i as u64);
        }
        ctx("anyone.near", 0, 100);
        c.close_poll("p".into());
        assert_eq!(transfers().len(), 5);
        assert!(!c.get_poll("p".into()).unwrap().decided);
        let mut c = poll(5000, "plurality");
        for (i, (m, ch)) in ballots.iter().enumerate() {
            vote(&mut c, m, ch, 30 + i as u64);
        }
        ctx("anyone.near", 0, 100);
        c.close_poll("p".into());
        assert_eq!(transfers(), vec![("ra.near".to_string(), 5 * SHARE)]);
    }

    #[test]
    fn a_quorum_exactly_on_the_boundary_is_met() {
        let mut c = poll(6000, "majority"); // 3 of 5 is exactly 60%
        for (i, m) in ["m1.near", "m2.near", "m3.near"].iter().enumerate() {
            vote(&mut c, m, "A", 30 + i as u64);
        }
        ctx("anyone.near", 0, 100);
        c.close_poll("p".into());
        assert_eq!(transfers(), vec![("ra.near".to_string(), 5 * SHARE)]);
    }

    #[test]
    fn a_plurality_tie_decides_nothing() {
        let mut c = poll(5000, "plurality");
        for (i, (m, ch)) in [
            ("m1.near", "A"),
            ("m2.near", "A"),
            ("m3.near", "B"),
            ("m4.near", "B"),
            ("m5.near", "abstain"),
        ]
        .iter()
        .enumerate()
        {
            vote(&mut c, m, ch, 30 + i as u64);
        }
        ctx("anyone.near", 0, 100);
        c.close_poll("p".into());
        assert_eq!(transfers().len(), 5);
        assert!(!c.get_poll("p".into()).unwrap().decided);
    }

    #[test]
    fn the_pool_goes_to_the_winning_option_whichever_it_is() {
        let mut c = poll(5000, "majority");
        for (i, (m, ch)) in [
            ("m1.near", "B"),
            ("m2.near", "B"),
            ("m3.near", "B"),
            ("m4.near", "A"),
            ("m5.near", "A"),
        ]
        .iter()
        .enumerate()
        {
            vote(&mut c, m, ch, 30 + i as u64);
        }
        ctx("anyone.near", 0, 100);
        c.close_poll("p".into());
        assert_eq!(transfers(), vec![("rb.near".to_string(), 5 * SHARE)]);
    }

    #[test]
    fn the_pool_is_what_was_deposited_not_the_size_of_the_roll() {
        ctx("anyone.near", 0, 10);
        let mut c = PublicMarket::default();
        c.open_poll(
            "p".into(),
            options(),
            roll(),
            NearToken::from_yoctonear(SHARE),
            0,
            "majority".into(),
            100,
        );
        for (i, m) in ["m1.near", "m2.near", "m3.near", "m4.near"]
            .iter()
            .enumerate()
        {
            ctx(m, SHARE, 20 + i as u64);
            c.join_poll("p".into());
        }
        vote(&mut c, "m1.near", "A", 30);
        ctx("anyone.near", 0, 100);
        c.close_poll("p".into());
        assert_eq!(transfers(), vec![("ra.near".to_string(), 4 * SHARE)]);
    }

    #[test]
    #[should_panic(expected = "only the roll")]
    fn an_outsider_cannot_join() {
        let mut c = poll(5000, "majority");
        ctx("outsider.near", SHARE, 40);
        c.join_poll("p".into());
    }

    #[test]
    #[should_panic(expected = "must deposit exactly the share")]
    fn joining_needs_exactly_the_share() {
        ctx("anyone.near", 0, 10);
        let mut c = PublicMarket::default();
        c.open_poll(
            "p".into(),
            options(),
            roll(),
            NearToken::from_yoctonear(SHARE),
            5000,
            "majority".into(),
            100,
        );
        ctx("m1.near", SHARE - 1, 20);
        c.join_poll("p".into());
    }

    #[test]
    #[should_panic(expected = "already joined")]
    fn joining_twice_is_refused() {
        let mut c = poll(5000, "majority");
        ctx("m1.near", SHARE, 40);
        c.join_poll("p".into());
    }

    #[test]
    #[should_panic(expected = "only a member who joined")]
    fn voting_needs_a_deposit() {
        ctx("anyone.near", 0, 10);
        let mut c = PublicMarket::default();
        c.open_poll(
            "p".into(),
            options(),
            roll(),
            NearToken::from_yoctonear(SHARE),
            5000,
            "majority".into(),
            100,
        );
        vote(&mut c, "m1.near", "A", 30);
    }

    #[test]
    #[should_panic(expected = "unknown option")]
    fn voting_for_an_unknown_option_is_refused() {
        let mut c = poll(5000, "majority");
        vote(&mut c, "m1.near", "Z", 30);
    }

    #[test]
    #[should_panic(expected = "has ended")]
    fn no_vote_after_the_end() {
        let mut c = poll(5000, "majority");
        vote(&mut c, "m1.near", "A", 100);
    }

    #[test]
    #[should_panic(expected = "has not ended")]
    fn the_poll_cannot_close_early() {
        let mut c = poll(5000, "majority");
        ctx("anyone.near", 0, 50);
        c.close_poll("p".into());
    }

    #[test]
    #[should_panic(expected = "already settled")]
    fn the_poll_closes_only_once() {
        let mut c = poll(5000, "majority");
        vote(&mut c, "m1.near", "A", 30);
        ctx("anyone.near", 0, 100);
        c.close_poll("p".into());
        c.close_poll("p".into());
    }

    // ---------------------------------------------------------------- open RFQ (taker and makers)
    const UNITS: u32 = 10;
    fn rfq(side: &str, limit_micro: u128) -> PublicMarket {
        ctx("anyone.near", 0, 10);
        let mut c = PublicMarket::default();
        let deposit = if side == "buy" {
            UNITS as u128 * limit_micro * MICRO
        } else {
            0
        };
        ctx("taker.near", deposit, 11);
        c.open_rfq("q".into(), side.into(), UNITS, limit_micro, 100);
        c
    }
    fn maker_quote(c: &mut PublicMarket, who: &str, price_micro: u128, block: u64) {
        let deposit = if c.get_rfq("q".into()).unwrap().side == "sell" {
            UNITS as u128 * price_micro * MICRO
        } else {
            0
        };
        ctx(who, deposit, block);
        c.rfq_quote("q".into(), price_micro);
    }

    #[test]
    fn the_taker_side_size_and_limit_are_public_before_any_maker_quotes() {
        let c = rfq("buy", 2200);
        let r = c.get_rfq("q".into()).unwrap();
        assert_eq!(
            (r.taker.as_str(), r.side.as_str(), r.units, r.limit_micro),
            ("taker.near", "buy", 10, 2200)
        );
    }

    #[test]
    fn a_buy_rfq_goes_to_the_lowest_ask_and_every_quote_is_public() {
        let mut c = rfq("buy", 2200);
        maker_quote(&mut c, "m4.near", 2150, 20);
        maker_quote(&mut c, "m3.near", 2100, 21);
        maker_quote(&mut c, "m2.near", 2000, 22);
        let r = c.get_rfq("q".into()).unwrap();
        assert_eq!(
            (r.best_maker.unwrap().as_str(), r.best_price_micro, r.quotes),
            ("m2.near", 2000, 3)
        );
        assert_eq!(
            c.get_rfq_quotes("q".into())
                .iter()
                .map(|x| x.price_micro)
                .collect::<Vec<_>>(),
            vec![2150, 2100, 2000]
        );
    }

    #[test]
    fn a_sell_rfq_goes_to_the_highest_bid_and_an_outbid_maker_is_refunded() {
        let mut c = rfq("sell", 1800);
        maker_quote(&mut c, "m4.near", 1850, 20);
        maker_quote(&mut c, "m3.near", 1970, 21);
        assert_eq!(
            transfers(),
            vec![("m4.near".to_string(), UNITS as u128 * 1850 * MICRO)]
        );
        let r = c.get_rfq("q".into()).unwrap();
        assert_eq!(
            (r.best_maker.unwrap().as_str(), r.best_price_micro),
            ("m3.near", 1970)
        );
    }

    #[test]
    fn closing_a_buy_rfq_pays_the_winner_and_refunds_the_taker_the_difference() {
        let mut c = rfq("buy", 2200);
        maker_quote(&mut c, "m2.near", 2000, 20);
        ctx("anyone.near", 0, 100);
        c.close_rfq("q".into());
        let t = transfers();
        assert!(t.contains(&("m2.near".to_string(), UNITS as u128 * 2000 * MICRO)));
        assert!(t.contains(&(
            "taker.near".to_string(),
            UNITS as u128 * (2200 - 2000) * MICRO
        )));
        assert!(c.get_rfq("q".into()).unwrap().settled);
    }

    #[test]
    fn closing_a_sell_rfq_pays_the_taker_from_the_winners_escrow() {
        let mut c = rfq("sell", 1800);
        maker_quote(&mut c, "m3.near", 1970, 20);
        ctx("anyone.near", 0, 100);
        c.close_rfq("q".into());
        assert_eq!(
            transfers(),
            vec![("taker.near".to_string(), UNITS as u128 * 1970 * MICRO)]
        );
    }

    #[test]
    fn a_buy_rfq_with_no_quote_refunds_the_taker_in_full() {
        let mut c = rfq("buy", 2200);
        ctx("anyone.near", 0, 100);
        c.close_rfq("q".into());
        assert_eq!(
            transfers(),
            vec![("taker.near".to_string(), UNITS as u128 * 2200 * MICRO)]
        );
    }

    #[test]
    fn a_sell_rfq_with_no_quote_moves_nothing() {
        let mut c = rfq("sell", 1800);
        ctx("anyone.near", 0, 100);
        c.close_rfq("q".into());
        assert!(transfers().is_empty());
    }

    #[test]
    #[should_panic(expected = "above the taker's limit")]
    fn a_buy_quote_above_the_limit_is_refused() {
        let mut c = rfq("buy", 2200);
        maker_quote(&mut c, "m1.near", 2201, 20);
    }

    #[test]
    #[should_panic(expected = "below the taker's limit")]
    fn a_sell_bid_below_the_limit_is_refused() {
        let mut c = rfq("sell", 1800);
        maker_quote(&mut c, "m1.near", 1799, 20);
    }

    #[test]
    #[should_panic(expected = "must improve")]
    fn a_buy_quote_must_be_lower_than_the_best() {
        let mut c = rfq("buy", 2200);
        maker_quote(&mut c, "m1.near", 2100, 20);
        maker_quote(&mut c, "m2.near", 2100, 21);
    }

    #[test]
    #[should_panic(expected = "must improve")]
    fn a_sell_bid_must_be_higher_than_the_best() {
        let mut c = rfq("sell", 1800);
        maker_quote(&mut c, "m1.near", 1900, 20);
        maker_quote(&mut c, "m2.near", 1900, 21);
    }

    #[test]
    #[should_panic(expected = "the taker cannot quote")]
    fn the_taker_cannot_quote_on_their_own_request() {
        let mut c = rfq("buy", 2200);
        maker_quote(&mut c, "taker.near", 2000, 20);
    }

    #[test]
    #[should_panic(expected = "buyers deposit units x limit")]
    fn a_buy_request_needs_the_full_deposit() {
        ctx("taker.near", 1, 11);
        let mut c = PublicMarket::default();
        c.open_rfq("q".into(), "buy".into(), UNITS, 2200, 100);
    }

    #[test]
    #[should_panic(expected = "a sell maker must attach units x price")]
    fn a_sell_maker_must_attach_the_full_notional() {
        let mut c = rfq("sell", 1800);
        ctx("m1.near", 1, 20);
        c.rfq_quote("q".into(), 1900);
    }

    #[test]
    #[should_panic(expected = "has ended")]
    fn no_rfq_quote_after_the_end() {
        let mut c = rfq("buy", 2200);
        maker_quote(&mut c, "m1.near", 2000, 100);
    }

    #[test]
    #[should_panic(expected = "has not ended")]
    fn the_rfq_cannot_close_early() {
        let mut c = rfq("buy", 2200);
        ctx("anyone.near", 0, 50);
        c.close_rfq("q".into());
    }

    #[test]
    #[should_panic(expected = "already settled")]
    fn the_rfq_closes_only_once() {
        let mut c = rfq("buy", 2200);
        ctx("anyone.near", 0, 100);
        c.close_rfq("q".into());
        c.close_rfq("q".into());
    }

    #[test]
    #[should_panic(expected = "side must be buy or sell")]
    fn the_side_must_be_buy_or_sell() {
        ctx("taker.near", 0, 11);
        let mut c = PublicMarket::default();
        c.open_rfq("q".into(), "hold".into(), UNITS, 2200, 100);
    }
}
