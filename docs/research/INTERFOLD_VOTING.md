# How The Interfold handles confidential ballots and voting

*Tavily `pro` research run, 2026-11-07. Its citations are listed at the end of the report; I did not read the cited pages myself. Treat it as a secondary summary to check against docs.theinterfold.com and the CRISP repository.*

# How The Interfold (formerly Enclave) implements confidential ballots and voting

## Overview
The Interfold protocol implements confidential coordination by letting independent parties encrypt their inputs and having a committee of ciphernodes run the computation; only the verified output is decryptable and published (the network runs a distributed key generation to produce a shared committee public key) [1]. The CRISP application is the Interfold use case for private, coercion‑resistant DAO voting: voters submit ciphertexts to a CRISP smart contract, the E3 program aggregates ballots under encryption, and a committee reveals only the final tally [6].

## E3 (Encrypted Execution Environments)
Interfold’s Encrypted Execution Environments (E3s) are ephemeral, computation‑scoped confidential computations created via on‑chain requests; each E3 has its own committee, DKG, public key, deadlines, and fee escrow [4]. The whitepaper states Interfold’s E3s combine fully homomorphic encryption (FHE), zero‑knowledge proofs (ZKPs), and distributed threshold cryptography (DTC) to provide cryptographic and economic guarantees for data privacy and correct execution; Interfold explicitly contrasts E3s with Trusted Execution Environments (TEEs) by not relying on trusted hardware and aiming to resist side‑channel attacks [2]. The protocol publishes only the Keccak‑256 hash of ciphertext outputs on chain while the full ciphertext is kept in a data‑availability layer [3].

Threat/attestation model: E3 integrity is enforced by the ciphernodes’ collective cryptographic control (DKG, threshold keys, and ZK proofs), not by hardware attestation; outputs are bound by receipts that include E3 metadata, the committee public key, input Merkle root, and output hash [3], and successful execution is proved with ZK proofs per the whitepaper [2].

## Ciphernodes: role, topology, and trust model
Ciphernodes form committees that run DKG, accept encrypted inputs, execute secure processes over ciphertexts, and perform threshold decryption or partial decryption duties; committee membership is stored and managed by a CiphernodeRegistry on chain [3]. Operator economics are enforced via a BondingRegistry and slashing (operators bond FOLD tokens and can be slashed or expelled via SlashingManager) [3]. Bonding and ticketing determine committee seats (bonding levels and lottery constraints are described in public analyses) [10]. Committee sizes are configurable (examples: Minimum N=3 with shares=2; Micro N=9 shares=5; Small N=19 shares=10) [4]. The network design assumes independent, bonded operators selected by sortition and subject to economic penalties in case of misbehavior [11],[13].

Operational details such as who runs individual ciphernodes in production, precise onboarding/offboarding procedures beyond on‑chain registration, and the full operator discovery topology are documented at a high level but not fully enumerated in publicly cited artifacts [3],[10].

## Threshold FHE: usage and limits
Interfold’s design uses FHE as a core primitive and runs a distributed key generation to produce a threshold FHE key for committees; the Constitution and docs state the committee runs DKG to generate a threshold fully‑homomorphic encryption key and computations run under that key [13],[2]. The default E3 program templates can require a proof that each ciphertext is a valid BFV encryption under the committee key, and CRISP requires such a BFV encryption proof for each ballot input [4],[6]. Beyond the mention of BFV proofs and the existence of a threshold FHE key, the public artifacts do not specify concrete scheme parameters, exact threshold/robustness arithmetic, the full DKG protocol specification, or performance/latency metrics for real workloads — those are currently undocumented in available sources [4],[13].

## secure-process program (program server / runtime)
The compute provider executes the secure process over ciphertexts; current implementation details indicate use of the OpenVM zkVM to run the FHE computation on CPU or GPU, with a program server running a program‑runner binary that accepts compute requests over HTTP and posts a result callback [3],[5]. The system produces a receipt binding program identity, the committee public key, and input/output commitments [3]. Source code for the Interfold monorepo and CRISP program (including frontend, Rust coordination server, build scripts and Noir circuits) is publicly available, enabling code provenance and review [5],[6]. The docs describe an update mechanism via registered E3 programs (owner must register an E3 program before requests may use it) but do not publish a detailed runtime hardening checklist beyond best‑practices guidance [3],[12].

## Ballot encryption and message flow
In CRISP, ballots are encrypted client‑side to the committee’s shared public key and submitted as ciphertexts to the CRISP smart contract; each encrypted ballot includes a zero‑knowledge proof that the ciphertext has a valid vote format and a signature from a registered voter [2],[6]. Inputs are read from a data‑availability layer (CRISP uses Avail in configuration), and the client SDKs (e.g., @interfold/sdk and frontend packages) support reading the committee public key, encrypting inputs, optionally generating input proofs, and submitting inputs to the E3 program contract [3],[12],[6]. Voters may resubmit (change their vote) before the input deadline; the system counts only the latest message per voter at tally time [2].

Wire formats and exact on‑wire encodings for ciphertexts, ZK proof artifacts, and the SDK serialization formats are present in GitHub repos but are not exhaustively documented in the public prose artifacts cited here; some of that detail lives inside code and build artifacts [5],[6].

## Decryption, tallying, and verification
Decryption authority is threshold‑distributed: a committee performs DKG and holds the threshold key such that no single ciphernode can decrypt the full computation; CRISP aggregates ciphertexts under encryption and the committee decrypts only the final tally [13],[6]. Tally computation is performed over encrypted inputs (homomorphic aggregation is indicated by the FHE + aggregation design), and correctness of execution is asserted with zero‑knowledge proofs; the Interfold contract stores only an output hash while ciphernodes post plaintext result hashes and anyone can trigger execution of the attached transaction payload after verification [2],[3]. The exact tally reconstruction protocol (message flows, share aggregation algorithms, and proof artifacts expected on‑chain) is described at a high level but not fully specified as wire‑level protocol text in the cited documentation [2],[3],[6].

## Tally verification and auditability
Interfold publishes commitments and receipts that bind E3 identity, committee public key, input Merkle root, and output hash; E3 computations include ZK proofs of correct execution per the whitepaper, and after ciphernodes post plaintext result hashes on‑chain, anyone can call a function to execute transaction payloads tied to those results, enabling public verification workflows [2],[3]. CRISP’s design explicitly requires per‑ballot input proofs and end‑to‑end proofs of computation, but sample proof artifacts and step‑by‑step external verifier instructions are available primarily inside code repositories rather than as narrative proof atlases in the public docs [6],[5].

## Eligibility, one‑vote enforcement, and revocation
Voter eligibility is enforced by the CRISP contract: ballots are signed by registered voters and only the latest message per voter before the input deadline is counted, enabling single‑vote semantics by replacing prior submissions [2],[6]. Interfold governance examples show integration with on‑chain token voting (FOLD ERC20Votes) for membership and staged governance workflows, indicating on‑chain token gating is a supported model [7]. Details about off‑chain KYC, credential issuance, revocation procedures, and replay‑protection primitives beyond "latest message wins" are not exhaustively documented in the cited materials [7],[6].

## Coercion resistance, receipts, and leakage
CRISP is designed for coercion resistance: it explicitly markets itself as a "Coercion‑Resistant Impartial Selection Protocol", supports client‑side encryption, and permits voters to change their vote during the input window (receipt‑freedom via deniable/resubmission patterns) [6],[11]. Practical effectiveness depends on client UX, window design, and whether an adversary can observe submission timing or force disclosure; the public materials assert the design goals but do not provide formal coercion‑resistance proofs or operational measurement of coercion attacks [6],[11].

## Information leakage
Interfold stores ciphertext outputs in a data‑availability layer while publishing only hashes on chain; election metadata such as E3 creation, deadlines, committee identity (registry entries), and the presence of outputs and their on‑chain timestamps are therefore observable [3],[4]. The documentation does not fully enumerate side‑channels (network timing, DA layer metadata, per‑vote submission timestamps) nor definitive mitigations; this is an evidence gap to be remedied by operational telemetry and threat modeling documentation [3],[4].

## Current maturity, audits, and limitations
The network has progressed through internal testnet phases toward public testnet and mainnet rollout plans [11]. Releases are published (v0.17.0 signed release notes are available) and an audit by Zenith Auditors was announced as finding no significant issues (tweeted by the auditor) [9],[12]. The codebase and CRISP demos are public and buildable, but several low‑level cryptographic parameters, precise DKG/tally reconstruction protocols, proof artifacts, and production performance/scale metrics are not fully specified in public prose [5],[6],[13].

## Evidence gaps (explicit)
- Full specification of the threshold FHE scheme parameters, exact DKG protocol, and share‑reconstruction algorithms (beyond statement that a threshold FHE key is produced) [13],[4].  
- Exact wire formats, serialized ciphertext/ZK proof formats, and on‑chain proof payload schemas [5],[6].  
- Detailed operational procedures for ciphernode onboarding/offboarding, operator identities in production, and the complete threat model for network‑level side‑channels [3],[10].  
- Formal coercion‑resistance proofs and measured leakage/side‑channel analyses [6],[11].

Questions to ask Interfold maintainers
- Which concrete FHE scheme and parameter set is used in production (beyond BFV‑proof requirement), and what are expected performance characteristics? [4],[13]  
- Which DKG protocol implementation is used (citation to code/path + reproducible ceremony instructions) and how are secret shares distributed and stored? [13],[5]  
- Where are canonical wire formats and proof‑artifact examples published (sample ciphertext blobs, ZK proof files, and verifier scripts)? [5],[6]  
- Operationally, who operates ciphernodes today, and what logs/artifacts are available to auditors to detect collusion or compromise? [3],[10]

## Plain‑language security summary
Interfold runs encrypted computations (E3s) where voters encrypt ballots client‑side and a committee of bonded ciphernodes jointly manages decryption authority; the system relies on FHE + ZKPs + DTC rather than trusted hardware. It aims to provide private ballots and verifiable tallies, but several low‑level cryptographic and operational details necessary for a full security assessment (exact FHE parameters, DKG specifics, wire formats, and side‑channel mitigations) are not fully documented publicly.

## Recommended follow‑up actions / audit targets
- Request canonical DKG and threshold‑FHE protocol specs, plus reproducible key‑generation ceremony logs and artifacts.  
- Obtain example ciphertexts, ZK proof artifacts, and verifier scripts; run local verification of an end‑to‑end CRISP election.  
- Audit the program‑runner/OpenVM execution environment, proof aggregation, and proof‑verification code paths (including release v0.17.0 binaries and the test‑only skip_proof_aggregation option) [9],[5].  
- Threat‑model the DA layer (Avail) and measure leakage (timing, submission ordering) with a test election.  
- Request operator registry snapshots, slashing records, and bonding/ticket allocation data to validate economic incentives and committee selection.

## Works Cited
[1] https://docs.theinterfold.com  
[2] https://docs.theinterfold.com/whitepaper  
[3] https://docs.theinterfold.com/learn/architecture  
[4] https://docs.theinterfold.com/learn/what-is-e3  
[5] https://github.com/theinterfold/interfold  
[6] https://github.com/theinterfold/CRISP  
[7] https://github.com/theinterfold/crisp-aragon-plugin  
[8] https://github.com/theinterfold/crisp-aragon-plugin-app  
[9] https://github.com/theinterfold/interfold/releases  
[10] https://l2beat.com/privacy/projects/interfold-crisp  
[11] https://blog.theinterfold.com/from-enclave-to-the-interfold  
[12] https://x.com/zenith256/status/2074197943817781642  
[13] https://github.com/theinterfold/interfold/blob/main/docs/pages/constitution.mdx
