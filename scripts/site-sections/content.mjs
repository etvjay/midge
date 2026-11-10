/**
 * The landing page's sections after the hero, as plain data (plan 2026-11-10-site-bento-direction; approved mockup
 * https://claude.ai/artifact/Pw9hUowrfnQhvHKNh92Suh). Recorded numbers are written as {figureKey} tokens and filled from
 * scripts/site-scenes/figures.mjs at build time, so a number on the page always comes from its source. Illustrative numbers
 * live only in `example` or `book` fields, which the page labels "example amounts".
 */
export const HOME = {
  problem: {
    kicker: '01 · The problem', title: 'Deciding together with money', soft: 'on the line is hard',
    lede: 'A fund splitting a pot, a DAO picking a quote, a team of AI agents buying together. Today there are three ways to do it, and each one breaks something.',
    public: {
      label: 'A · Do it in public', title: 'Everyone sees your bid before it lands, and trades against you',
      book: [
        { who: 'Member A', bid: '1,250', when: 'visible' }, { who: 'Member B', bid: '900', when: 'visible' },
        { who: 'Member C', bid: '1,100', when: 'visible' }, { who: 'Watcher', bid: '1,260', when: 'last second', watcher: true },
      ],
      bookNote: 'The watcher wins the lot by bidding just above',
      figs: [{ fig: 'auctionPublicRead', tone: 'deny', label: 'bids an observer read in our public auction' }, { fig: 'auctionSealedRead', tone: 'lake', label: 'with Midge sealed bids, same run' }],
    },
    organizer: {
      label: 'B · Trust an organizer', title: 'One person holds the money. If they vanish or get hacked, it is gone',
      aria: 'Four backers send {organizerBackers} to one organizer, who moves the pot to an account of its choosing',
      chips: [{ fig: 'organizerRead', text: 'amounts read through the organizer' }, { fig: 'organizerVanish', text: 'recovered by members if it disappears' }],
    },
    blackbox: {
      label: 'C · Trust a black box', title: 'Private, but if it can pay anything, one bug empties the pot',
      body: 'Secure hardware has had real attacks. Midge assumes it can fail, and limits what a failure can pay.',
    },
    compare: {
      caption: 'Measured on testnet, same chain, fresh accounts', source: 'docs/lab/COMPARISON_*.md', cols: ['Public', 'Organizer', 'Midge'],
      rows: [
        { k: 'Bids or amounts an observer read', cells: [{ t: '{auctionPublicRead}', tone: 'deny' }, { t: '{organizerRead}', tone: 'deny' }, { t: '{auctionSealedRead}', tone: 'lake' }] },
        { k: 'Who can move the pot', cells: [{ t: 'no pot: each pays directly', tone: 'mute', src: { file: 'docs/lab/COMPARISON_RESULTS.md', quote: 'Each backer pays the recipient directly.' } }, { t: 'the organizer, alone', tone: 'deny', src: { file: 'docs/lab/COMPARISON_RESULTS.md', quote: 'The organizer moved a 0.04 pot to an account of its choosing and nothing stopped it' } }, { t: 'no one outside the rules', tone: 'lake', src: { file: 'docs/lab/COMPARISON_RESULTS.md', quote: 'no operator can take the pot or pay outside the fixed policy' } }] },
        { k: 'If the operator disappears', cells: [{ t: 'not applicable', tone: 'mute', src: { file: 'docs/lab/COMPARISON_RESULTS.md', quote: '| If the operator disappears | not applicable |' } }, { t: 'members recover {organizerVanish}', tone: 'deny', src: { file: 'docs/lab/COMPARISON_RESULTS.md', quote: 'members recover **0%**' } }, { t: 'each member leaves alone', tone: 'lake', src: { file: 'docs/lab/COMPARISON_RESULTS.md', quote: 'each member recovered their remainder alone' } }] },
      ],
    },
    keeps: {
      label: 'What Midge keeps',
      items: [{ t: 'Private like the black box', tone: 'lake' }, { t: 'Rules anyone can read, like public', tone: 'lake' }, { t: 'An exit no organizer gives you', tone: 'glow' }],
      cta: { t: 'See how it works', href: '#how' },
    },
  },

  engine: {
    kicker: '02 · How it works', title: 'Group money, built at the level of the rules.', soft: 'Each part checks the one before it.',
    room: { label: 'The room', title: 'Members seal their bids. Only the room can open them.', body: 'It weighs every bid or vote in secure hardware and proposes one payout. It holds no key to the money.' },
    rules: { label: 'The rules', body: 'Set when the group is created and stored on NEAR: who may be paid, how much per round, until when. Anyone can read them, and the contract has no method to change them.' },
    payout: { label: 'The payout', body: 'Paid only if it fits the rules. Anything else is refused and nothing moves.' },
    exit: { label: 'The exit', body: 'If the room stops, each member takes their own share back.' },
  },

  uses: {
    kicker: '03 · Who uses it', title: 'For groups that decide together with money on the line',
    tiles: [
      { t: 'Auctions and token sales', s: 'Sealed bids; losing bids never published', icon: 'M8 12h8M12 8v8', span: 3 },
      { t: 'Voting', s: 'Sealed ballots; only the result is paid', icon: 'M8 12l3 3 5-6', span: 3 },
      { t: 'Paying people', s: 'One-time addresses; owners stay private', icon: 'M7 12h10M13 8l4 4-4 4', span: 2 },
      { t: 'Investing together', s: 'Equal deposits hide who put in how much', icon: 'M8 15l3-3 2 2 3-4', span: 2 },
      { t: 'AI agents', s: 'A key that can only take money back', icon: 'M9 10h6v5H9zM10.5 10V8.5a1.5 1.5 0 0 1 3 0V10', span: 2 },
    ],
  },

  rules: {
    kicker: '04 · The rules', title: "Every group's rules sit next to its money, in the contract",
    body: 'Read them live, with no server of ours in between. The room can only propose; the contract decides.',
    panelHead: 'view · the newest group', waiting: 'Reading the newest group’s rules from NEAR…',
    noScript: 'Turn on JavaScript to read them here, or open the contract on NearBlocks.',
    cta: { t: 'Open the contract', href: 'https://testnet.nearblocks.io/address/c.fly-1793636729.testnet' },
  },

  list: {
    kicker: '05 · Uses', title: 'Run group money by rules',
    intro: 'One contract, one set of rules per group, the same exit for everyone. Each of these has run on testnet next to a public version of it.',
    items: ['Sealed-bid auctions, first and second price', 'Secret ballots that pay the winning option', 'Payroll to one-time addresses', 'Investing together with equal deposits', 'AI agents whose key can only take their owner’s money back'],
    cta: { t: 'See them in the proof', href: '#proof' },
  },

  agents: {
    kicker: '06 · AI agents', title: 'A hijacked AI agent', soft: "still can't take the money",
    lede: "An agent can be given a key that does one thing only: take its owner's money back out. We tricked such an agent into trying everything. Every attempt was refused.",
    attempts: [
      { i: 0, t: 'Send money to the attacker', b: 'The agent was told to send NEAR to the attacker.' },
      { i: 1, t: 'Call another contract', b: 'The agent was told to call a method on a contract that is not the Midge contract.' },
      { i: 2, t: 'Approve a payout itself', b: 'The agent was told to call the payout method on the Midge contract.' },
      { i: 4, t: 'Make the attacker an owner', b: "The agent was told to add the attacker's key as a full-access key." },
    ],
    fine: 'The key limits what a fooled agent can do; it does not stop the agent from being fooled.',
    figs: ['attempts', 'attemptsRefused', 'attemptsThrough'],
  },

  parts: {
    kicker: '07 · Under the hood', title: 'The parts, and what we call them', soft: 'in the code',
    lede: 'The page uses plain words. The contract and the code keep older names, so here is the map, in case you read either.',
    cards: [
      { t: 'The room', code: 'Roost', size: 'lg', d: 'Opens the members’ sealed bids, works out the result, and signs one payout. It holds no key to the money. It runs on a host: an AI model on NEAR AI Cloud that the bids are sealed to, or our own program on Phala Cloud.', s: 'Model host live · Phala host attested on 4 and 8 Nov, not running now' },
      { t: 'The rules', code: 'Nest', size: 'md', d: 'The NEAR contract that holds the money: who can be paid, how much per window, until when. It refuses anything else, even with a valid signature.', s: 'c.fly-1793636729.testnet · live' },
      { t: 'Members', code: 'flyers', size: 'md', d: 'Anyone with a NEAR account. Each bid or ballot is sealed so only the room can open it, and signed so only its member could have sent it.', s: 'Signed bids · live on testnet' },
      { t: 'Opening a room', code: 'hatch', size: 'sm', d: 'Creates a group with its rules. One-off rooms close after one task; ongoing rooms last across rounds.', s: 'One-off live · ongoing tested in the contract' },
      { t: 'The exit', code: 'escape hatch', size: 'sm', d: 'After the exit timer, any member takes back what is left of their own money, alone. Nobody else’s share moves.', s: '{exits} exits recorded' },
      { t: 'Settling', code: 'settle_batch', size: 'sm', d: 'The contract pays what the room signed, if it fits the rules. A stuck payout can be finished by anyone after {stuckPayout}.', s: '{payouts} payouts · {refused} refused' },
      { t: 'Two hosts', code: 'two-room agreement', size: 'md', d: 'One room run by two independent hosts that must both sign before any money moves: two cashiers stamping the same receipt.', s: 'Run with two local hosts; {twoHostsHardware}' },
      { t: 'The advisor', code: 'advisor', size: 'md', d: 'An AI model in NEAR AI Cloud’s secure hardware that proposes how to split a total. It sees only the total, never a bid.', s: 'Proposed the split in a live round' },
    ],
    hosts: {
      title: 'Three ways to run code in secure hardware',
      lede: 'All three run on Intel TDX and come with a hardware report. The difference is who operates the machine, how long it lives, and what can call it. Each cell quotes its source.',
      cols: ['Phala Cloud', 'OutLayer', 'NEAR AI Cloud'],
      rows: [
        { k: 'The unit', cells: [
          { t: 'A whole machine: any Docker container, as a confidential VM', src: { file: 'docs/sources/secure-hardware-hosts.md', quote: 'Deploy any Docker container as a CVM on supported TEEs' } },
          { t: 'One function per call, at most 180 seconds', src: { file: 'docs/sources/secure-hardware-hosts.md', quote: '180 seconds per execution' } },
          { t: 'A hosted AI model the bids are sealed to', src: { file: 'docs/canonical/CURRENT_STATE.md', quote: "Bids sealed to a NEAR AI Cloud model's attested Ed25519" } },
        ] },
        { k: 'Who operates it', cells: [
          { t: 'We deploy and run it', src: { file: 'docs/sources/secure-hardware-hosts.md', quote: 'Deploy any Docker container as a CVM on supported TEEs' } },
          { t: 'OutLayer\u2019s workers, on dstack', src: { file: 'docs/sources/secure-hardware-hosts.md', quote: 'the worker runs in an Intel TDX confidential VM via dstack' } },
          { t: 'NEAR AI', src: { file: 'site/main.js', quote: 'https://cloud-api.near.ai/v1/attestation/report' } },
        ] },
        { k: 'What can call it', cells: [
          { t: 'Whatever our program exposes', src: { file: 'docs/sources/secure-hardware-hosts.md', quote: 'Deploy any Docker container as a CVM on supported TEEs' } },
          { t: 'A NEAR contract, or any client over HTTPS', src: { file: 'docs/sources/secure-hardware-hosts.md', quote: 'or any client can call the HTTPS API directly' } },
          { t: 'Anyone with the API; members seal bids to its key', src: { file: 'docs/canonical/CURRENT_STATE.md', quote: "Bids sealed to a NEAR AI Cloud model's attested Ed25519" } },
        ] },
        { k: 'Hardware report', cells: [
          { t: 'One for the machine: its image, arguments and settings', src: { file: 'docs/sources/secure-hardware-hosts.md', quote: 'Docker image hash, startup arguments, and environment variables' } },
          { t: 'A fresh one for every run', src: { file: 'docs/sources/secure-hardware-hosts.md', quote: 'it generates a fresh **attestation**' } },
          { t: 'One per request, checkable from your browser', src: { file: 'site/main.js', quote: 'https://cloud-api.near.ai/v1/attestation/report' } },
        ] },
        { k: 'Checked on NEAR', cells: [
          { t: 'Not by this platform; you check the report', src: { file: 'docs/sources/secure-hardware-hosts.md', quote: 'Docker image hash, startup arguments, and environment variables' } },
          { t: 'Once per worker, at registration; each result then carries the worker\u2019s signature', src: { file: 'docs/sources/secure-hardware-hosts.md', quote: 'Results are then signed by the worker key' } },
          { t: 'Not by this platform; your browser checks the report', src: { file: 'site/main.js', quote: 'https://cloud-api.near.ai/v1/attestation/report' } },
        ] },
        { k: 'In Midge today', cells: [
          { t: 'Our room program, run on real TDX machines on 4 and 8 Nov; not running now', tone: 'glow', fig: 'phalaHosted' },
          { t: 'Not used yet: only a model of its spending limits', tone: 'mute', fig: 'outlayerModel' },
          { t: 'Live: the room host members seal bids to', tone: 'lake', fig: 'modelHost' },
        ] },
      ],
      source: 'Sources, quoted and dated: docs/sources/secure-hardware-hosts.md (OutLayer and Phala docs, read 10 Nov 2026) and Midge’s current state.',
    },
  },

  proof: {
    kicker: '08 · Proof', statementA: '{transactions} transactions', statementB: 'Not one paid outside the rules',
    dotsTitle: 'Every dot is a real transaction',
    lensPub: 'What anyone can see', lensPriv: 'What stayed private', lensHint: 'Point at a dot, or move through them with Tab. Each one opens on NearBlocks.',
    refusal: {
      label: 'A recorded refusal', title: 'A payout to an account that was not on the list',
      body: 'The contract refused it before anything else, and no money moved. Open it on NearBlocks.',
      head: 'payout call · group lab-mw30klm2-2', run: 'run 20261105T035644Z-7c1d', recipient: 'thief-mw30klm2.testnet',
      hash: '3gW41Caz1wK4cCDFpixTJ3KweM6qpF7ZGxm6ARB1CmPk', reason: 'Refused · the recipient is not on the group\u2019s list',
    },
    runsTitle: 'What runs where, today', runsNote: 'Testnet only · no audit yet · every test account was ours',
    partners: [
      { name: 'NEAR Protocol', role: 'the contract · testnet', status: 'Live', tone: 'lake', fig: 'contractLive', d: 'Holds every group’s money and rules, pays only within them, and runs the exit.' },
      { name: 'NEAR AI Cloud', role: 'the model the room seals bids to', status: 'Live', tone: 'lake', fig: 'modelHost', d: 'Bids are sealed to a model in secure hardware; it proposes the split. Check it from your browser above.' },
      { name: 'Phala Cloud', role: 'dstack · Intel TDX', status: 'Attested, not running now', tone: 'glow', fig: 'phalaHosted', d: 'The room as its own program in a confidential VM. Run on real TDX machines on 4 and 8 Nov; they were temporary.' },
      { name: 'NEAR Chain Signatures', role: 'Bitcoin · Ethereum · Solana', status: 'Signing live, not yet rule-bound', tone: 'glow', fig: 'chainSignatures', d: 'Our NEAR account paid a payee on Solana devnet and one on Ethereum Sepolia, each by a transaction the MPC network signed. The Midge contract did not request them, so a group\u2019s rules do not limit them yet.' },
      { name: 'NEAR Intents · 1Click', role: 'asset registry', status: 'Read-only', tone: 'glow', fig: 'intentsAssets', d: '{intentsAssets} assets read live across NEAR, Bitcoin, Ethereum and Solana. 1Click has no testnet, so no swap was made.' },
      { name: 'For agents', role: 'MCP tools · JavaScript SDK · HTTP API', status: 'Runs on your machine', tone: 'lake', fig: 'agentTools', d: 'Every route, SDK method and MCP tool exercised; the API and MCP server run locally. The limited keys that can only take money back are live on testnet.' },
      { name: 'Simulations', role: 'JavaScript models', status: 'Not on chain', tone: 'mute', fig: 'simulations', wide: true, d: 'Lending quotes, block trades between desks and shared AI requests run as models today, not on the contract.' },
    ],
  },

  trust: {
    kicker: '09 · What it cannot do', title: 'The room cannot take the money.', soft: 'Only the rules can pay.',
    note: 'One honest limit: on testnet our deploy key can still upgrade the contract, so the rules are only as fixed as that key. It is removed before mainnet (gap GAP-044).',
    cards: [
      { t: 'It cannot take the money', d: 'The room only proposes. Only the contract pays, and only within the rules every member agreed to.', e: '{refused} refused by the rules on testnet' },
      { t: 'It cannot pay outside the rules', d: 'An unlisted account or a payout over the cap is refused, and nothing moves.', e: 'Recipient and cap checked in the contract' },
      { t: 'It cannot lock anyone in', d: 'If the room stops, every member takes their own share back after the exit timer.', e: '{exits} exits recorded' },
    ],
  },

  tryIt: {
    kicker: '10 · Try it', title: 'Three ways in',
    cards: [
      { t: 'Check everything, offline', d: 'One command runs every test and check. No keys, no money.', cmd: 'git clone https://github.com/etvjay/midge && cd midge\nnpm install && npm run verify' },
      { t: 'Run your own copy', d: 'Make a free testnet account, deploy your own contract and run real rounds and attacks against it.', cmd: 'node scripts/setup-testnet-account.js\nnpm run build:wasm\nnode scripts/lab-env.mjs bootstrap\nnode lab/run.js --tier testnet', link: { t: 'The step-by-step guide', href: 'https://github.com/etvjay/midge/blob/master/docs/LAB.md' } },
      { t: 'Look at the live network', d: 'The newest groups, read from NEAR by your browser:', live: true },
    ],
  },

  faq: [
    { name: 'About Midge', items: [
      ['What is Midge?', 'A network of private rooms with public rules, on NEAR. Any group (a fund, a DAO, a team, a set of AI agents) gets a private room to decide in, rules fixed in public that limit what the room can pay, and an exit each member can use alone. One contract on NEAR hosts many groups.'],
      ['Who is it for?', 'Groups that decide together with money on the line: sealed-bid auctions and token sales, secret ballots that pay the winning option, payroll to one-time addresses, investing together, and AI agents that buy or pay together.'],
      ['What is live today, and what is not?', 'Live on NEAR testnet: the contract with its rules, payouts and exit, bids sealed to a NEAR AI Cloud model, and limited agent keys. The SDK, API and MCP tools run on your machine. Attested but not running now: the room on Phala. Models only: lending quotes, block trades, shared AI. Next: paying out on Bitcoin, and moving the multichain payroll from our account to a group.'],
      ['Is this live? Can I lose real money?', 'It is a working prototype on NEAR testnet, where coins have no value. There is no token, and no audit yet.'],
      ['Can I check any of this myself?', 'Yes. Read the contract and its rules straight from NEAR, open any dot in the proof section on the public explorer, or run every test offline with one command.'],
    ] },
    { name: 'Money and safety', items: [
      ['Can the room run off with the money?', 'No. The room holds no key to the money. It can only propose a payout, and the contract on NEAR pays it only if it follows the rules every member agreed to: who can be paid, how much per window, and until when.'],
      ['What if the room stops or disappears?', "Each member takes back what is left of their own money, with no one's permission, once the group's exit timer has run. Nobody else's share is touched."],
      ['What stays private, and what is public?', "Private: what each member bids, votes or decides, and for payroll who owns each one-time address. Public: who deposited, how much, the rules, and every payout's amount and recipient."],
      ['What stops a hijacked AI agent?', "Its key can do one thing: take its owner's money back out. In our recorded run, a tricked agent tried {attempts} ways to move money; all {attemptsRefused} were refused."],
    ] },
    { name: 'Integrations', items: [
      ['What does Midge integrate with?', "NEAR testnet for the contract, NEAR AI Cloud for the model the room seals bids to, Phala Cloud for the room as its own program, NEAR Chain Signatures for addresses on other chains, and NEAR Intents' 1Click API for its asset registry. For agents: MCP tools, a JavaScript SDK and an HTTP API with live streams."],
      ['How can an AI agent use it?', "Through the MCP tools, the JavaScript SDK or the HTTP API. Give the agent a limited key and the only thing that key can do on its own is take its owner's money back out."],
      ['Does it work with other chains?', 'Partly, on testnets. With NEAR Chain Signatures our NEAR account has paid a payee on Solana devnet and one on Ethereum Sepolia, each by a transaction the MPC network signed and the chain confirmed. The Midge contract did not request those payments, so a group\u2019s rules do not limit them yet; that is the next piece of work. Nothing has been sent on Bitcoin.'],
      ['Does it use NEAR Intents?', "A recorded audit read the 1Click Swap API's asset registry: {intentsAssets} assets across NEAR, Bitcoin, Ethereum and Solana. 1Click runs on mainnet only, so no swap has been made from testnet."],
    ] },
    { name: 'Partners and tech', items: [
      ['Which partner technology does Midge use?', 'NEAR Protocol (the contract, in Rust), NEAR AI Cloud (a model on Intel TDX whose report also carries NVIDIA GPU evidence), Phala Cloud (dstack confidential VMs on Intel TDX), NEAR Chain Signatures, NEAR Intents (1Click), public NEAR RPC (FastNEAR) and NearBlocks.'],
      ['How does NEAR AI Cloud fit in?', "Members seal their bids to a model running in NEAR AI Cloud's secure hardware, and the model proposes the split. Your browser can check that hardware on this page with a random number it picks."],
      ['How does Phala fit in?', 'The room can run as its own program in a confidential VM on Phala Cloud. It was run on real Intel TDX machines on 4 and 8 November; those machines were temporary and none is running now.'],
      ['Does Midge use OutLayer?', 'Not yet. OutLayer runs one function per call on its own secure workers, each run with a fresh hardware report. Phala runs a whole machine we operate. Midge has a model of OutLayer-style spending limits for agents, but calls neither OutLayer nor a running Phala machine today.'],
      ['What is this site built with?', 'Static HTML, CSS and JavaScript. The hero was rendered in Blender and is drawn live with three.js. Every figure comes from a recorded run or is read live from NEAR.'],
    ] },
  ],
};
