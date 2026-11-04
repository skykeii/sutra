# Research behind Sutra

These are the papers and standards cited in the SIH 2026 deck (slide 6) and the demo video. Each entry says where its idea appears in Sutra and how far we use it.

Two documents are included here because their terms allow copying. The rest are paywalled, so they are linked by DOI rather than copied.

## The paper presented in the demo video

**R. T. Snodgrass, S. S. Yao and C. Collberg, "Tamper Detection in Audit Logs," *Proceedings of the 30th International Conference on Very Large Data Bases (VLDB)*, Toronto, 2004, pp. 504–515.**
[PDF from the VLDB Endowment](https://www.vldb.org/conf/2004/RS13P1.PDF) · [DOI](https://doi.org/10.1016/B978-012088469-8.50046-2) · [local copy](snodgrass-yao-collberg-2004-tamper-detection-in-audit-logs.pdf)

| The paper | Sutra | Match |
|---|---|---|
| Tamper detection inside the database, using one-way hashes | `append_audit` in `supabase/migrations/0003_audit.sql` computes SHA-256 in Postgres | Same idea |
| Hashes linked in transaction order | Each entry's hash covers the previous hash plus the entry, under a lock that keeps the order | Same idea |
| A separate validator re-hashes and finds the corrupted transactions | `verifyFullChain` in `lib/audit/verify.ts` recomputes the chain and reports the first broken entry | Simpler: Sutra stops at the first break |
| Periodic checkpoints held by an off-site notary that an intruder cannot alter | Ed25519-signed anchors, published at `/transparency` | **Weaker.** Sutra signs its own anchors, and **Verify audit integrity** does not compare against them |
| Not part of the paper's scheme | Triggers block update, delete and truncate on the log | Our addition |

Copyright notice, as the paper's terms require: *Permission to copy without fee all or part of this material is granted provided that the copies are not made or distributed for direct commercial advantage, the VLDB copyright notice and the title of the publication and its date appear, and notice is given that copying is by permission of the Very Large Data Base Endowment. To copy otherwise, or to republish, requires a fee and/or special permission from the Endowment.* Proceedings of the 30th VLDB Conference, Toronto, Canada, 2004.

## Papers on the deck's reference slide

| Paper | Where it appears in Sutra | Depth |
|---|---|---|
| V. I. Levenshtein, "Binary codes capable of correcting deletions, insertions, and reversals," *Soviet Physics Doklady* 10(8), 1966. No DOI | Edit distance in `lib/validation/rules.ts`. A name within distance 2 of the APAAR record is a warning with a suggested fix; further apart is an error | Our own code |
| J. S. Turner, "New directions in communications (or which way to the information age?)," *IEEE Communications Magazine* 24(10), 1986. [doi:10.1109/MCOM.1986.1092946](https://doi.org/10.1109/MCOM.1986.1092946) | `take_token` in `0007_app_support.sql`: per-visitor rate limits | Adapted: the leaky bucket, written as a token bucket |
| S. Haber and W. S. Stornetta, "How to time-stamp a digital document," *Journal of Cryptology* 3(2), 1991. [doi:10.1007/BF00196791](https://doi.org/10.1007/BF00196791) | Linked hashes in the audit log | Adapted: no outside time-stamping service; signed anchors stand in |
| B. Schneier and J. Kelsey, "Secure audit logs to support computer forensics," *ACM TISSEC* 2(2), 1999. [doi:10.1145/317087.317089](https://doi.org/10.1145/317087.317089) | The aim of a tamper-evident log | Adapted: their evolving keys are not implemented |
| D. J. Bernstein, N. Duif, T. Lange, P. Schwabe and B.-Y. Yang, "High-speed high-security signatures," *Journal of Cryptographic Engineering* 2(2), 2012. [doi:10.1007/s13389-012-0027-1](https://doi.org/10.1007/s13389-012-0027-1) · [authors' copy](https://ed25519.cr.yp.to/ed25519-20110926.pdf) | Ed25519 signs credentials, receipts, result batches and audit anchors (`signPayload` in `lib/crypto/index.ts`) | Through Node's crypto library; we did not implement the algorithm |
| M. Bellare, R. Canetti and H. Krawczyk, "Keying hash functions for message authentication," *CRYPTO '96*, LNCS 1109. [doi:10.1007/3-540-68697-5_1](https://doi.org/10.1007/3-540-68697-5_1) | HMAC-SHA256 for matching IDs across colleges without sharing them, and for webhook signatures | Through Node's crypto library. Blind matching is our design choice, not the paper's |
| D. A. McGrew and J. Viega, "The security and performance of the Galois/Counter Mode (GCM) of operation," *INDOCRYPT 2004*, LNCS 3348. [doi:10.1007/978-3-540-30556-9_27](https://doi.org/10.1007/978-3-540-30556-9_27) | AES-256-GCM encrypts stored contact details and APAAR IDs (`encryptField`) | Through Node's crypto library |
| D. D. Clark and D. R. Wilson, "A comparison of commercial and military computer security policies," *IEEE Symposium on Security and Privacy*, 1987. [doi:10.1109/SP.1987.10001](https://doi.org/10.1109/SP.1987.10001) | Two-person approval for intake changes, revocations and new verifiers (`lib/approvals.ts`) | The separation-of-duty principle only |

## Standards and sources

- **RFC 8032, Edwards-Curve Digital Signature Algorithm (EdDSA)**, IETF, 2017. [doi:10.17487/RFC8032](https://doi.org/10.17487/RFC8032) · [local copy](rfc8032-eddsa.txt)
- **W3C Verifiable Credentials Data Model**: [w3.org/TR/vc-data-model](https://www.w3.org/TR/vc-data-model/). Sutra's credentials follow its shape and 2018 context, with our own signature proof. They do not claim formal conformance.
- **Digital Personal Data Protection Act, 2023**, Government of India. It shapes the consent and minimal-disclosure design.
- **PIB backgrounder, "Academic Bank of Credits and APAAR"**, July 2026: [PDF](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2026/jul/doc202675912501.pdf). This is the source of the 26.35 crore verified APAAR IDs figure.
- **SIH 2026 problem statement 26263**: [sih.gov.in/sih2026PS](https://www.sih.gov.in/sih2026PS).

The DOIs were checked against Crossref in November 2026.
