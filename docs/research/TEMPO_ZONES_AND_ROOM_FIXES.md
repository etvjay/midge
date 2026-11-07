# Tempo Zones: how close are we, and the fixes for the room's weak points
*2026-11-07. Two Parallel deep-research runs (`ultra` on Tempo Zones, `pro` on the fixes). Cited sources are in the raw reports; I read the summaries and the comparison sections, not every cited page. Tempo's documentation is young and changing: re-check it before relying on any line here.*
## Tempo Zones, summarised
- **Private From The Public, Not The Operator**: Zones keep their ledger off the public chain, but the operator can read the full state. That differs materially from an operator-blind TEE room -> define whose surveillance your design prevents. [executive_summary[0]] [14]
- **Current Settlement Has A Trust Gap**: T13 accepts a temporary `NoProof` mode that retains quorum and continuity checks but skips attestation. Signatures alone do not prove correct execution -> do not assume that every settled Zone batch has been execution-verified. [executive_summary[1]] [17]
- **Unilateral Exit Is Not Available Today**: Current documentation says forced exits remain unfinished and withdrawals depend on the operator continuing to submit batches -> main-chain escrow is not an operator-independent recovery guarantee. [executive_summary[1]] [17]
- **Bridge Privacy Is Partial**: Deposit recipients and memos are encrypted to the operator, but deposit token, amount, and depositor remain public. Withdrawal recipients and amounts are also public -> distinguish private internal activity from public entry and exit. [executive_summary[2]] [13][executive_summary[3]] [31]
- **Mainnet Support Is Not Full Maturity**: T13 activated on mainnet on **November 3, 2026**, but Zones remain in **limited preview**. The current runtime disables general token transfers and user contract deployment -> evaluate the deployed product, not unrestricted private-EVM assumptions. [executive_summary[4]] [29][executive_summary[5]] [20]
- **Your Strongest Potential Difference Is Enforced Rights**: Operator-blind inputs, an L1-enforced recipient/cap/deadline policy, and a genuine non-cooperative exit would be meaningful differences. Merely combining an operator, enclave, and public-chain escrow would not establish those advantages.
- **Shared Architecture Does Not Establish Copying**: Tesseract already combines trusted hardware, offchain accounting, blockchain settlement, and time-limited deposits with user recovery -> compare the actual privacy and recovery mechanisms, not just the component list. [executive_summary[6]] [36]

**Bottom line:** The designs overlap at the level of private offchain execution backed by public-chain assets. Your design becomes substantively different only if its stronger privacy boundary, fixed release constraints, and unilateral exit are implemented guarantees rather than labels.
## Point-by-point against a TEE room with an L1 release policy
The right-hand column describes your proposed design, **not an independently verified implementation**. Where its specification leaves a mechanism open, the comparison is conditional.

| Dimension | Tempo Zones | Your proposed room |
|---|---|---|
| Execution object | Separate private ledger/network anchored to Tempo. [6_point_by_point_comparison_with_your_tee_room[0]] [14] | A private TEE application; it need not be a blockchain or expose an EVM. |
| Operator role | Operator runs infrastructure; active leader produces blocks; sequencer set signs commitments. [6_point_by_point_comparison_with_your_tee_room[1]] [16] | Operator hosts and schedules the enclave. A sequencer role exists only if your application needs transaction ordering. |
| Sealed inputs | Deposit recipient and memo encrypted to the operator's key. [6_point_by_point_comparison_with_your_tee_room[2]] [13] | Potentially encrypted directly to an attested enclave key. Sealing to the host's key would not provide host blindness. |
| Privacy from operator | Operator can read the full ledger. [6_point_by_point_comparison_with_your_tee_room[0]] [14] | A meaningful improvement only if plaintext and keys remain inaccessible outside approved enclave code. |
| Public information | Bridge amounts, withdrawal destinations, and settlement checkpoints remain public. [6_point_by_point_comparison_with_your_tee_room[0]] [14] | L1 payouts and cleartext policy parameters remain visible unless you add a separate concealment mechanism. |
| L1 custody | Portal holds backing and processes accepted withdrawals. [6_point_by_point_comparison_with_your_tee_room[1]] [16] | Contract holds assets and authorizes releases under the fixed room policy. |
| Allowed recipients | Account membership and registered callback gateways are configurable controls. [6_point_by_point_comparison_with_your_tee_room[1]] [16] | A fixed, L1-enforced payout-recipient restriction can be stronger than configurable membership. |
| Per-epoch cap | No standard immutable per-epoch payout-cap guarantee is specified in the documented portal controls. [6_point_by_point_comparison_with_your_tee_room[1]] [16] | Contract must maintain the cap independently of enclave restarts or alternative signing instances. |
| Deadline | No general member-recovery deadline is established by the documented withdrawal path. [6_point_by_point_comparison_with_your_tee_room[3]] [17] | A release deadline limits settlement timing; it does not itself create a refund or exit. |
| Enclave-signed settlement | Intended Nitro-attested path; current `NoProof` fallback remains. [6_point_by_point_comparison_with_your_tee_room[3]] [17] | Enclave signatures must be authenticated against approved code and the fixed policy, with no unintended bypass. |
| Unilateral member exit | Not currently implemented as a forced/permissionless recovery guarantee. [6_point_by_point_comparison_with_your_tee_room[3]] [17] | Potentially a major difference, but only with an operator-independent claim and settlement procedure. |
| Bridging and composition | Native Tempo portal path and composable withdrawal callbacks. [6_point_by_point_comparison_with_your_tee_room[2]] [13] | No automatic equivalent. Cross-room or cross-chain routing requires additional design. |
| Administrative flexibility | Configurable sequencer set, access controls, pauses, and delayed capability abdication. [6_point_by_point_comparison_with_your_tee_room[1]] [16] | Stronger immutability is possible, but must include upgrade and emergency-authority rules. |
| Maturity | Limited preview with current runtime restrictions. [6_point_by_point_comparison_with_your_tee_room[4]] [20] | Not established from the supplied design alone. |

The main difference is therefore not "private subchain versus private room." It is **what the operator is allowed to learn and what the operator can prevent or authorize**.

### A hypothetical Room R shows the stronger claim

Suppose Room R's L1 contract fixes its allowed recipients, aggregate per-epoch outflow limit, and settlement deadline. Even if the enclave signs an excessive payout, the contract should reject it. That is an independently enforced release envelope, not merely a promise that enclave code behaves correctly.

However, the envelope does not establish each member's correct balance. A compromised enclave could still misallocate payments within permitted recipients and caps. Repeated epochs can also permit repeated losses; an epoch cap is not a lifetime solvency guarantee.

The exit path must coexist with that envelope. If a member's recovery address is not allowed, the epoch cap is exhausted, or the deadline has passed, which rule takes precedence? Without an explicit answer, fixed policy and unilateral exit can contradict each other. Define exit eligibility, reserved liabilities, replay protection, and settlement-versus-exit ordering before calling the design stronger.

**Decision:** Position the room around enforceable rights and a narrower trust boundary, not around the presence of a TEE alone.
## Copy risk and dominance
### Tesseract shows why the component list is not unique

Tesseract supplies a useful precedent: it uses trusted hardware for offchain accounting and blockchain settlement. Its deposits are enclave-controlled before a time limit; afterward, the user can recover funds with a secret key only that user knows. The timeout is a specific recovery mechanism, rather than an assertion that assets remain user-owned. [7_synthesis_differentiation_copy_risk_and_dominance[0]] [36]

That distinction exposes the central design choice. A TEE may authorize normal operation, while a different onchain condition authorizes recovery when normal operation fails. Tesseract does not establish that your room is secure, and its exchange and cross-chain machinery is not identical to a payments Zone. It does show why "TEE + escrow + signed settlement + timeout" is not uniquely attributable to Tempo. [7_synthesis_differentiation_copy_risk_and_dominance[0]] [36]

| Strategy | Security mechanism | Privacy boundary | Failure recovery / trade-off |
|---|---|---|---|
| Current Zones | Quorum/continuity checks, with attestation bypass during rollout. [7_synthesis_differentiation_copy_risk_and_dominance[1]] [17] | Private from public observers; operator sees state. [7_synthesis_differentiation_copy_risk_and_dominance[2]] [14] | Operator-dependent withdrawal; unfinished forced exits. [7_synthesis_differentiation_copy_risk_and_dominance[1]] [17] |
| Proof-enforced Zone path | Execution replay authenticated by approved Nitro attestation. [7_synthesis_differentiation_copy_risk_and_dominance[3]] [15] | Still not inherently operator-blind. [7_synthesis_differentiation_copy_risk_and_dominance[2]] [14] | Execution integrity alone does not supply unavailable exit data. [7_synthesis_differentiation_copy_risk_and_dominance[4]] [24] |
| Your proposed room | TEE authorization plus independent L1 release constraints | Potentially operator-blind if inputs and keys remain enclave-confined | Potentially stronger recovery, but only if exit evidence and priority rules are specified |
| Tesseract precedent | Enclave-mediated accounting and settlement | Encrypted trading communications. [7_synthesis_differentiation_copy_risk_and_dominance[0]] [36] | Time-limited deposits enable user recovery; cross-chain fairness adds further machinery. [7_synthesis_differentiation_copy_risk_and_dominance[0]] [36] |

The non-obvious tension is that **stronger privacy can make recovery harder**: keeping state entirely inside a room removes public reconstruction data. A real exit therefore needs a deliberately available recovery claim without unnecessarily revealing the room's full contents. The validium data-withholding problem illustrates why a commitment alone is insufficient. [7_synthesis_differentiation_copy_risk_and_dominance[4]] [24]

### When the room would look like a rebranded Zone

Architectural differentiation would be weak if the operator can decrypt all inputs, L1 accepts the operator's state assertions without stronger independent constraints, release policy remains operator-changeable, and "exit" still requires operator cooperation. In that case, the proposal largely reproduces the same trust shape while changing terminology.

It would be more clearly differentiated if it demonstrates all three: **host-blind processing**, **non-bypassable L1 release limits**, and **recovery after permanent operator loss**. These are security properties to demonstrate, not features established by the words "sealed," "fixed," or "unilateral." Architectural similarity alone is not evidence of code copying or a legal conclusion.

### When Zones would dominate it

Zones would dominate only if a suitable deployment could provide the same required privacy boundary, fixed policy, and genuine exit guarantees while matching or improving the relevant cost, integration, and operational trade-offs. Current documentation does not establish those stronger guarantees, so unconditional dominance is not supported. [7_synthesis_differentiation_copy_risk_and_dominance[2]] [14][7_synthesis_differentiation_copy_risk_and_dominance[1]] [17]

Conversely, if your actual need is only privacy from public explorers plus an operator-run ledger and Tempo integration, a bespoke TEE room may add implementation risk without a needed security advantage. If its release constraints can instead be imposed through a non-bypassable policy layer around a suitable existing system, that alternative deserves comparison before building another execution stack.

**Recommendation:** Make the room's decisive demonstration an adversarial one: the host cannot decrypt inputs; an invalid but enclave-signed payout fails L1 policy; and a member recovers a valid entitlement after the operator and enclave permanently stop. Those outcomes would distinguish the design far more clearly than another private-chain architecture diagram.
---

## Fixes for operator failure, censorship, metadata, code choice and chip-vendor trust
The strongest design is **not just an attested operator signature**. It is an L1 escrow with independently enforceable recovery rules, plus an attested private computation service whose authority is deliberately limited. Shade already supports the relevant separation: attestation verification in NEAR contracts and contract-level guardrails that can reject unauthorized actions even if the TEE is compromised. [executive_summary[0]] [16]

- **Exit Rights Before Availability**: Arbitrum distinguishes forcing a message into processing from successful application execution. An operator-run private room needs the same distinction -> provide an L1-enforceable refund or exit that does not require the failed operator. [executive_summary[1]] [9]
- **Recoverable State Before Rotation**: Ekiden combines off-chain execution with on-chain state to support consistency and survival of compute-node failures -> preserve checkpoints, recovery data and exit witnesses, not just a state hash. [executive_summary[2]] [17]
- **Quorums Have Two Different Jobs**: A proposed **2-of-3** room committee can require agreement while tolerating one unavailable signer, but replicated plaintext remains exposed to any compromised replica -> design settlement integrity and confidentiality separately.
- **Encryption Does Not Hide Participation**: Loopix combines mixing with cover traffic, rather than relying on payload encryption -> pad messages, obscure traffic rates and separate public funding identity from private submission authorization. [executive_summary[3]] [8]
- **Attestation Is Not Code Approval**: Enclave code can deliberately disclose information; reproducible builds connect a reviewed source tree to a measured binary, not to a guarantee of good behavior -> independently approve and pin measurements before releasing secrets. [executive_summary[4]] [12]
- **Upgrade Governance Is Custody Governance**: dstack documents measurement authorization through multisig and timelock controls -> apply equivalent delays to room code, settlement keys, verifier policy and the escrow itself. [executive_summary[5]] [7][executive_summary[6]] [5]
- **Vendor Diversity Must Match The Threat**: Independent Intel and AMD replicas, a CPU/GPU pipeline, threshold signing and MPC have different security properties -> do not describe them interchangeably as removing single-vendor trust.
- **NEAR Enforcement Is Practical; Extensions Need Engineering**: Shade documents NEAR contract attestation and guardrails; NEAR's MPC lifecycle documentation describes Intel TDX workloads -> start with that documented path, and treat heterogeneous attestation, private MPC computation and application-specific ZK verification as separate integrations. [executive_summary[0]] [16][executive_summary[7]] [11]

### define the escrow s failure outcome before funding
For this system, separate **settlement safety**, **fund recoverability**, **service liveness** and **privacy**. A room may protect secrets yet stop responding. It may keep responding while censoring one member. It may produce a valid hardware attestation for code that users should never authorize. These are different failure modes, so a single heartbeat or signature check cannot be the whole security policy.

**Case study: Ekiden's split between execution and authoritative state.** Ekiden places smart-contract execution in TEE-backed compute nodes while maintaining on-chain state. Its stated purpose includes consistency - one authoritative sequence of transitions - and availability when compute nodes fail. [1_define_the_escrow_s_failure_outcome_before_funding[0]] [17]

That architecture suggests an important design rule for your room: the operator's machine must not be the only place containing the information needed to recover funds. However, a commitment alone does not reveal its underlying balances or supply a user's authentication path. The recovery design must specify who possesses those objects and what happens when the operator withholds them.

Choose explicitly between these escrow models:

| Proposed model | Independently enforceable fallback | Required recovery material | Main trade-off |
|---|---|---|---|
| Finite, isolated round | After a deadline, cancel the unsettled round and refund its reserved deposits | Public deposit accounting and a deterministic cancellation rule | Can discard useful computation; invites strategic aborts if cancellation is economically advantageous |
| Continuous private balances | Freeze a finalized checkpoint; withdraw the balance proven at that checkpoint | Balance witness, authorization and any required decryption/proving material | More complex; stale-checkpoint exits can conflict with later obligations |
| Publicly verifiable private transition | Accept a proof of the specified state transition, with a separately defined recovery path | Available state/input data and a usable proof-generation path | Stronger integrity, but additional circuit and prover engineering |

The simplest robust starting point is an **isolated round with a contractual refund deadline**, provided cancellation is an acceptable business outcome. Do not promise continuous private trading or credit while implementing only deposit refunds.

For either model, my recommended settlement authorization binds a domain separator, chain and contract identity, room ID, epoch, sequence number, previous state commitment, input commitment, output commitment, payout commitment and deadline. The escrow should reject replay, wrong epochs, stale parents and overspending independently of the room. This is a proposed application design, not a NEAR default.

**Decision:** Define precisely which assets remain withdrawable after failure and which obligations survive cancellation before selecting TEE infrastructure.

### forced inclusion must end in an executable escape
**Case study: Arbitrum's Delayed Inbox.** Arbitrum lets users submit through a parent-chain inbox rather than the sequencer. After the applicable force-inclusion window, anyone can advance eligible messages; the sequencer cannot skip or reorder the delayed messages. [2_forced_inclusion_must_end_in_an_executable_escape[0]] [9]

The critical distinction is that processing is not successful execution. Arbitrum documents checks that can cause a forced signed transaction to be dropped, and included transactions can still revert. [2_forced_inclusion_must_end_in_an_executable_escape[0]] [9] For your system, the corresponding limitation is stronger: putting ciphertext on NEAR does not compel a powered-off TEE to decrypt or compute it.

I recommend a **two-stage inclusion-and-escape mechanism**:

1. **Public request queue.** A member submits an encrypted request or an authenticated commitment with its data-availability location. The contract assigns its sequence and inclusion deadline. If censorship resistance depends on recovering the request, a bare hash is insufficient.
2. **Mandatory queue progress.** Each settlement advances a contiguous queue prefix. The contract rejects attempts to skip an overdue request while settling later work. Define approved handling of invalid requests so a malformed message cannot block every honest user indefinitely.
3. **Failure transition.** If the deadline passes without valid progress, any caller can freeze the affected epoch, stop new liabilities and activate the specified recovery mode.
4. **Independent payout.** Members claim refunds or checkpoint balances without obtaining another signature from the failed operator.

| Mechanism | What the proposed design achieves | What it does not achieve | NEAR assessment |
|---|---|---|---|
| L1 forced-request queue | A public ordering and deadline record | Private execution by a dead room | Straightforward application-contract logic |
| Mandatory-prefix settlement | Prevents continued settlement that skips overdue requests | Progress if every executor stops | Practical, but invalid-message handling needs care |
| Timed round cancellation | Refunds an unsettled isolated round | Completion of its computation | Best initial recovery design |
| Checkpoint force-exit | Withdrawal from an agreed frozen state | Recovery without witnesses or available data | Feasible, but substantially more engineering |
| Permissionless replacement executor | Another approved room can attempt progress | Access to missing state, inputs or keys | Conditional on the recovery architecture |

The table's practical assessments are engineering recommendations, not claims that NEAR supplies these application features automatically.

### Make State Availability Part Of Exit Finality

For continuous balances, distribute recoverable state and user witnesses before treating a checkpoint as safely exit-capable. Encrypted state may be published or replicated, but replacement rooms still need an authorized decryption path. Public availability of ciphertext is not availability of plaintext to the recovery mechanism.

Freeze the exit root atomically with disabling later conflicting settlements. Track spent claims or nullifiers so an exited balance cannot also remain spendable inside the room. Do not let users withdraw an old balance while a later accepted transition has already consumed it.

An escape that reveals a balance or proof publicly also has a privacy cost. Decide whether emergency disclosure is acceptable or whether exits need a privacy-preserving proof path.

**Decision:** Treat forced inclusion as an accountability tool; treat an independently executable exit as the actual fund-recovery guarantee. Both still depend on the underlying L1 remaining usable.

### rotation quorum rooms and bonds solve different problems
**Case study: NEAR's attested service identity.** NEAR's MPC lifecycle documentation describes services running in dstack CVMs on Intel TDX. It describes measuring the application image and binding a service identity, represented by a TLS public key, to enclave measurements in a TDX quote. [3_rotation_quorum_rooms_and_bonds_solve_different_problems[0]] [11]

This provides a useful model for replacing an operator: authorize a fresh attested identity rather than transferring authority informally to another server. But identity replacement alone cannot reconstruct a lost room database. My proposed rotation protocol therefore checkpoints state, distributes encrypted recovery material, authorizes the replacement's key, increments the epoch and retires the old epoch's settlement authority.

Old rooms must not retain usable authority after replacement. The escrow should reject their signatures even if their keys still exist. Freshly binding a replacement key is preferable to copying a long-lived signing key between machines.

### Use Independent Rooms, Not Merely More Processes

A simple starting point is multiple separately attested signers over an identical settlement digest. Separate operators, hosting accounts, administrative keys and key-release paths reduce shared operational failures. For a small committee, verifying individual signatures may be simpler than introducing a threshold-signing protocol; benchmark the actual contract implementation.

| Hypothetical policy | Integrity condition for accepting a correct result | Availability condition | Principal weakness |
|---|---|---|---|
| 1-of-3 | Every possible sole signer must be trustworthy | Any one signer responds | Any one compromised signer can authorize an invalid result |
| 2-of-3 | Fewer than two signers are compromised, and honest signers enforce the same transition rules | Two responsive signers agree | Two correlated compromises defeat integrity; inconsistent views can stall progress |
| 3-of-3 | At least one honest signer refuses an invalid result | All three respond and agree | Any one signer can halt settlement |

These are proposed authorization examples, not deployed NEAR parameters or a complete Byzantine consensus protocol. L1 serialization should enforce one accepted successor to each checkpoint, while honest rooms refuse conflicting or stale transitions.

Most importantly, if all rooms see the complete plaintext, one compromised room can disclose it regardless of the settlement threshold.

### Slash Objective Faults, Not Unobservable Intent

Bond each operator and retain the bond through the relevant evidence window. Proposed objectively checkable faults include two signatures on conflicting successors, signing outside an authorized epoch, or failing a clearly defined on-chain obligation by its deadline.

For censorship, use an L1-submitted request or a signed receipt that binds a request hash and deadline. An allegation that a private API request was ignored is much harder to adjudicate. A heartbeat proves little about whether a particular member was served.

Slashing should fund compensation and recovery incentives, but it cannot restore leaked secrets or force a destroyed machine to compute. Size the bond against defined exposure and compensation obligations; do not equate an arbitrary stake with comprehensive insurance.

**Decision:** Use rotation for operational recovery, quorum approval for settlement integrity, and bonds for attributable misconduct. Keep the force-exit available even when all three fail.

### protect metadata at the network and ledger boundaries
**Case study: Loopix's deliberate traffic shaping.** Loopix targets both unlinkability and unobservability. Its design combines independently delayed messages with continuously generated loop traffic; cover packets match real traffic in size, encryption and timing distribution. [4_protect_metadata_at_the_network_and_ledger_boundaries[0]] [8]

Nym's cover-traffic documentation describes replacing a cover packet with real data while sending cover packets when no data is available. [4_protect_metadata_at_the_network_and_ledger_boundaries[1]] [6] The practical lesson is not that a mixnet makes every workflow anonymous. It is that hiding message content and hiding whether a member is communicating require different mechanisms.

| Leakage surface | Recommended mitigation | Residual exposure or cost |
|---|---|---|
| Message length | Pad authenticated encrypted messages to fixed-size envelopes; bound fragmentation | Packet counts can still reveal large submissions |
| Submission time | Fixed epochs, shuffled batches and delayed acknowledgments | Added latency; sparse batches have small anonymity sets |
| Participation and traffic volume | Fixed send schedules with dummy messages or suitable cover traffic | Bandwidth and always-online costs; connection presence may remain visible |
| Client IP address | Independent relayers or a multi-hop mixnet | A single relayer sees the client; collusion and endpoint observation remain concerns |
| Public funding-to-submission link | Commitments plus unlinkable membership authorization or a shielded design | Additional cryptographic engineering and state management |
| Output and withdrawal correlation | Batched release, padded responses and, where needed, private exits | Public amounts, recipients and application behavior can still identify users |

Padding must be **end-to-end**: requests, acknowledgments, error responses and settlement publication schedules can all become signals. As a proposed policy, send a bounded number of fixed-size envelopes per member per epoch, with authenticated dummy payloads when idle. Pad batch outputs too; otherwise an observer may infer activity from the number of resulting actions.

A relayer alone should be described as transport or fee delegation, not as anonymity. If a submitted payload includes the member's public account or an openly verifiable account signature, moving it through a different network address does not erase that link. For stronger privacy, the application needs an authorization construction that proves membership without unnecessarily publishing identity.

Likewise, a public-L1 deposit remains a public event. Network mixing cannot erase an association the escrow explicitly records. Hiding the member set or deposit/withdrawal links requires additional on-chain privacy design, not just a private room.

For NEAR, padding, batching and off-chain relaying are realistic first steps. Mixnet transport is a client/network integration rather than a change to NEAR consensus. Unlinkable membership and shielded exits are a more substantial cryptographic project. Keep an explicit privacy downgrade for forced requests: a public emergency submission may reveal that a participant has become active.

**Decision:** Start with padding, epoch batching and separated relayers. Add cover traffic and mixnet transport when the threat includes traffic observers, and add ledger privacy only if membership or payment-link privacy is actually required.

### approve exact code then constrain how it can change
**Case study: reproducible enclaves versus malicious enclaves.** Trail of Bits describes independent parties reproducing an enclave build and comparing its measurement with the quote. It also states the essential limitation: enclave code itself can disclose data. [5_approve_exact_code_then_constrain_how_it_can_change[0]] [12]

Therefore, a genuine quote for malicious code is not an attestation failure. The room operator must not be allowed to choose its own definition of approved code. Reproducibility makes source-to-binary review possible; it does not establish that the reviewed program is safe.

Use this proposed approval chain:

| Control | Concrete design | What it does not prove |
|---|---|---|
| Reproducible builds | Pin source, compiler, dependencies, base image and build inputs; have independent builders reproduce artifacts | Absence of vulnerabilities or malicious source |
| Multi-party approval | Require independent review and signed approval of the source, configuration and expected measurement bundle | Independence if reviewers share the same compromised pipeline |
| Transparency log | Publish release manifests, builder approvals, measurements, upgrade proposals and revocations in an append-only public record; monitor it | Prevention by itself; someone must detect and act |
| Pinned measurements | Enforce exact approved application/platform measurements in clients and authorization contracts | Safety of unmeasured inputs or mutable external behavior |
| Key binding and freshness | Bind the session/settlement key to verified evidence and a fresh challenge or equivalent freshness policy | Future availability or indefinite platform security |
| Timelocked changes | Delay changes to code, keys, verifier policy and escrow authority | Protection if users cannot actually exit during the delay |

The manifest should include more than a binary digest. Pin behavior-changing configuration, runtime-loaded code, dependencies and any model or policy artifact that can affect settlement. Audit permitted network egress as well as the computation itself.

**Case study: dstack's authorization governance.** dstack documents a multisig-plus-timelock process for measurement authorization, with its KMS consulting on-chain policy before dispatching keys. Its governance operations cover registering measurements, revoking access and upgrading contracts. [5_approve_exact_code_then_constrain_how_it_can_change[1]] [7][5_approve_exact_code_then_constrain_how_it_can_change[2]] [5]

The important transferable property is that the operator cannot silently change which workload receives secrets. For your room, apply the delay to every route that can bypass that property, including the attestation verifier, escrow upgrade mechanism and administrator keys. Choose a delay that leaves enough time to observe the proposal and complete the actual exit process.

Shade's attestation library already documents checks covering quote/collateral validity, TCB status, report-data binding, accepted platform identifiers and measurements, plus event-log consistency. [5_approve_exact_code_then_constrain_how_it_can_change[3]] [18] It also explicitly does not impose particular application-compose semantics beyond matching the expected hash. [5_approve_exact_code_then_constrain_how_it_can_change[3]] [18] That is the boundary between available verification machinery and your responsibility for policy.

For emergency response, prefer a narrowly scoped freeze or revocation mechanism that cannot redirect funds or silently approve arbitrary code. Revocation cannot make previously exposed plaintext secret again.

**Decision:** Pin independently approved measurements before funding and secret release. Make governance unable to shorten the exit window or bypass approval through another administrative path.

### diversify trust without confusing integrity and confidentiality
**Case study: CPU/GPU attestation is a composition problem.** The Intel GPU-attestation documentation describes the following dependencies:

- The GPU confidential compute solution relies on a confidential VM CPU TEE, enabled by Intel(R) Trust Domain Extensions (Intel(R) TDX) 1.x on Intel CPUs. [6_diversify_trust_without_confusing_integrity_and_confidentiality[0]] [13] The CPU TEE provides the measurements and attestations needed to establish trust in the GPU. [6_diversify_trust_without_confusing_integrity_and_confidentiality[0]] [13] The CPU TEE serves as an orchestrator for securely transferring information to the GPU. [6_diversify_trust_without_confusing_integrity_and_confidentiality[0]] [13] Composite attestation of both the CPU TEE and the GPU TEE provides a more secure confidential computing solution than GPU-only attestation. [6_diversify_trust_without_confusing_integrity_and_confidentiality[0]] [13] The trust model of a GPU TEE relies on the CPU TEE to establish trust in the GPU, and to manage data flow and computations on the secure channel between the CPU and GPU. [6_diversify_trust_without_confusing_integrity_and_confidentiality[0]] [13]

- The GPU and confidential VM exchange keys to create an encrypted communications channel. [6_diversify_trust_without_confusing_integrity_and_confidentiality[0]] [13] This is done through a fully encrypted process. [6_diversify_trust_without_confusing_integrity_and_confidentiality[0]] [13] The CPU TEE provides the measurements and attestations needed to establish trust in the GPU. [6_diversify_trust_without_confusing_integrity_and_confidentiality[0]] [13] Composite attestation is the preferred method for confidential computing solutions that include a GPU TEE. [6_diversify_trust_without_confusing_integrity_and_confidentiality[0]] [13]

- Supported NVIDIA GPU architectures include Hopper with the H100 Tensor Core GPU, supporting single-GPU and multi-GPU attestation. [6_diversify_trust_without_confusing_integrity_and_confidentiality[0]] [13] Supported NVIDIA GPU architectures include Blackwell with the B200 Tensor Core GPU, supporting single-GPU and multi-GPU attestation. [6_diversify_trust_without_confusing_integrity_and_confidentiality[0]] [13] The Go client supports Hopper (H100, H200 series) and Blackwell (B100, B200 series). [6_diversify_trust_without_confusing_integrity_and_confidentiality[0]] [13]

- NRAS verifies the GPU TEE by comparing the evidence collected from the driver with the "golden measurements" stored in the NVIDIA Reference Integrity Manifest (RIM) service. [6_diversify_trust_without_confusing_integrity_and_confidentiality[0]] [13] The GPU evidence is provided by the NVIDIA GPU driver running on the server where the GPU is installed. [6_diversify_trust_without_confusing_integrity_and_confidentiality[0]] [13] The GPU driver must be running on the same server as the GPU. [6_diversify_trust_without_confusing_integrity_and_confidentiality[0]] [13] The local verifier still relies on NRAS for all verification collaterals, including Reference Integrity Manifests (RIMs) and OCSP certificate status. [6_diversify_trust_without_confusing_integrity_and_confidentiality[0]] [13]

- The corpus does not describe a demonstrated rollback attack. Multi-GPU attestation follows NRAS V3 token format that includes an overall attestation result and per-device claim details. [6_diversify_trust_without_confusing_integrity_and_confidentiality[0]] [13] The V3 EAT `claim_details` structure replaces the flat top-level GPU claims of the V1 token. [6_diversify_trust_without_confusing_integrity_and_confidentiality[0]] [13] If NRAS is experiencing uneven performance, timeouts, or is unavailable, an error will occur and Intel Trust Authority won't return an attestation token. [6_diversify_trust_without_confusing_integrity_and_confidentiality[0]] [13]

For your design, treat a CPU-plus-GPU pipeline as a **stack of components requiring explicit trust analysis**, not automatically as independent votes. NVIDIA confidential computing is relevant if private computation uses a GPU; it is not a drop-in alternative CPU room merely because it has a different manufacturer.

By contrast, separately operated Intel TDX and AMD SEV-SNP rooms can be designed as independent executors. They need different attestation-verification paths and separately approved measurement bundles. Agreement also requires deterministic application semantics; hardware diversity does not fix inconsistent floating-point, randomness or external-input handling.

| Proposed composition | Integrity effect | Confidentiality effect | Availability and implementation cost |
|---|---|---|---|
| Replicas under one vendor | Quorum can limit individual operator compromise | Any plaintext replica can leak | Simpler operational path; correlated vendor risk remains |
| Independent Intel and AMD replicas | Cross-vendor approval can limit one vendor's ability to forge settlement | A compromised vendor still exposes plaintext held by its replica | Separate verifiers, builds, provisioning and recovery |
| CPU plus confidential GPU | Protects an accelerated workload when the full chain is correctly composed | Depends on protecting the whole sensitive-data path | Additional attestation and secure-channel dependencies |
| TEE plus required ZK validity proof | Settlement correctness depends on the proved relation, not only a TEE signature | ZK does not repair plaintext already leaked by the TEE | Circuit, prover and verifier engineering; proving can become a liveness dependency |
| Distributed threshold signing | Removes a complete signing key from any one participant, if implemented correctly | Does not inherently hide application inputs | Interactive protocol, share management and quorum availability |
| MPC over secret-shared inputs | Can protect computation without placing all plaintext in one room, under its stated adversary assumptions | Stronger separation from any one room/vendor | Greater communication, latency and application complexity |

The distinction between **threshold signing** and **private computation** is especially important. A distributed key can prevent one operator from signing alone while that same operator still sees every member's input. To protect inputs from a compromised room, distribute the computation itself or avoid sending that room recoverable full plaintext.

For a TEE-plus-ZK design, require the proof as part of settlement acceptance. Prove the intended transition against the same prior root, committed inputs, outputs, sequence and payout commitment that the escrow accepts. A proof that only verifies an attestation is not a proof that your business logic computed the correct result. Conversely, proving correctness does not supply missing data or compel the prover to remain online.

On NEAR, the documented lifecycle path is Intel TDX, and Shade supplies an application attestation path. [6_diversify_trust_without_confusing_integrity_and_confidentiality[1]] [11][6_diversify_trust_without_confusing_integrity_and_confidentiality[2]] [16] Do not assume that this establishes interchangeable AMD or NVIDIA support. Heterogeneous verification and application-specific ZK/MPC should be treated as custom integrations requiring implementation, performance testing and security review, rather than advertised as turnkey features.

**Decision:** Use independent operators first for liveness; add cross-vendor approval for correlated integrity risk. Use ZK for independently verifiable correctness and secret-sharing/MPC when the requirement is that no single room can learn the inputs.

### a practical near deployment blueprint
**Case study: Shade's separation of attestation and contract authority.** Shade describes verification of TEEs in NEAR contracts and the use of Chain Signatures, while explicitly allowing contract guardrails to stop unauthorized actions after TEE compromise. [7_a_practical_near_deployment_blueprint[0]] [16] This is a useful starting architecture, not a complete private-room protocol.

For funds already held by a NEAR contract, my recommendation is to keep the escrow as the ultimate authority and let room signatures authorize only narrowly defined state transitions. Cross-chain signing is a separate capability, not a reason to grant the room unrestricted custody over the escrow.

A proposed first implementation would contain:

| Component | Initial implementation | Practicality on NEAR |
|---|---|---|
| Escrow | Per-round reservations, conservation checks, epoch/nonce checks, settlement deadline and independent refunds | High: application-contract engineering |
| Attestation registry | Approved measurements, bound room keys, validity policy and revocation | Documented Shade building blocks; integrate and benchmark the chosen path |
| Censorship queue | Authenticated requests, sequence numbers, deadlines and mandatory-prefix settlement | High: custom contract logic |
| Recovery | Public round accounting and operator-independent claims | High for isolated rounds; harder for continuous private balances |
| Rotation | New attested keys, epoch increment, old-key retirement and recoverable state transfer | Feasible only with data/key recovery designed in advance |
| Room committee | Several independent signatures on one canonical settlement digest | Feasible; test signature verification and transaction limits |
| Metadata layer | Padded encrypted envelopes, fixed epochs, separated relayers and optional mixing | Primarily off-chain integration |
| Governance | Independent approvals, public manifests, delayed authorization changes and an exit-preserving freeze | Custom governance engineering |
| Stronger cryptography | Cross-vendor evidence, required transition proofs or secret-shared computation | Separate advanced workstreams, not assumed turnkey support |

A minimal state machine is **Open -> Locked -> Settled**, with **Locked -> Recovering -> Refunded/Exited** after a verifiable deadline. A replacement operator either resumes from a canonical checkpoint in a new epoch or the recovery state stays terminal. Do not allow a late signature from the old room to race a refund successfully.

Before funding, clients should verify the accepted code/policy and bind encryption to the attested room key. Before accepting a settlement, the contract should check authority, epoch, parent commitment, sequence, queue progress, deadline, signatures and payout conservation. Public authorization policy should also identify who can change each of those checks.

Design deadline operations as callable transitions: a user, keeper or other caller presents the overdue condition, and the contract deterministically applies it. Do not build the recovery promise around the failed operator submitting the timeout transaction. Likewise, structure payouts and retries so a failed external transfer cannot reopen a spent claim or create a double payment.

Prioritize three releases: first, bounded rounds with refunds and pinned code; second, independent replicas, rotation and metadata shaping; third, continuous private-state exits, heterogeneous verification or cryptographic private computation. This sequencing avoids making fund recovery depend on the most experimental component.

**Decision:** The most credible initial NEAR product is a bounded-round escrow with independent refunds, attested pinned room keys, tightly constrained settlement authority and delayed upgrades.
