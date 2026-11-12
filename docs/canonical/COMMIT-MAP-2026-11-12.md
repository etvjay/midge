# History rewrite of 2026-11-12: old and new commit ids

On 2026-11-12 the history of `master` was rewritten once, to remove a directory (`videos/`) that was committed by mistake in `514dbd0` and reached the public repository with PR #11. The directory held the working files of a film (music and sound-effect MP3s, images, HTML, fonts, JSON and a script). No credentials were involved.

## What was changed, and what was not

- **Only the 12 commits from `514dbd0` onward got new ids.** The other 430 commits are untouched, so every earlier reference to a commit still resolves.
- **The tree of `master` is identical before and after.** The tree id is `35d70418924f7c5099fd7c5b1b08a6d0a7345ac3` both for the old `master` (`9945fe7`) and for the new one (`6bf33ae`), so no file in the repository differs. Check it with `git rev-parse master^{tree}`.
- No commit in the new history touches `videos/`, and no `.mp3` or `videos/` path appears in any commit.
- One commit was dropped because nothing was left in it: the empty re-trigger commit `53c7b27`.
- The five branches that still held the old commits were deleted: `older-image-evidence`, `pin-gap052`, `fix-test-tmp-leak`, `pin-drpc-image`, `untrack-film-folder`. `docs-final-pass` did not contain the files and was left alone.

## Old id to new id

| Old | New | Subject |
|---|---|---|
| `514dbd0` | `787015e` | fix: the account-key check keeps 'not a key' apart from 'the provider could not answer' (GAP-052); retries a rate limit; the lab waits for provider agreement on new accounts |
| `c011b8f` | `2658543` | lab: the first hosted round signs its inputs (signedInputs option on the shared flow; the local experiment is unchanged) |
| `53c7b27` | dropped (it was an empty commit) | ci: re-trigger (the previous run was stuck in the queue through a GitHub outage) |
| `0fdcb89` | `007a55e` | Merge pull request #11 from etvjay/older-image-evidence |
| `df3e9aa` | `3872dba` | fix: the key-check refusal names the provider that could not answer and why (GAP-052, second step); records the first hardware try of the rebuilt image |
| `ea428ee` | `a2c6564` | chore: stop tracking the film working folder (videos/) and ignore it |
| `d07b335` | `a99b2a1` | Merge pull request #13 from etvjay/untrack-film-folder |
| `e8a9357` | `eeb2b93` | Merge pull request #12 from etvjay/pin-gap052 |
| `7784ed1` | `b98425c` | test: the invariant mutation test removes its temporary repository copies (it left five 17 MB folders in /tmp per run: 585 and about 7.5 GB by 2026-11-11) |
| `c0fb0bf` | `f06d452` | Merge pull request #14 from etvjay/fix-test-tmp-leak |
| `fb66a89` | `c990132` | deploy: pin the rebuilt Roost image (sha256:8b24055f…, compose hash 5124af59…) with test.rpc.fastnear.com and near-testnet.drpc.org as the room's providers; nine hardware experiments pass on it; GAP-052 verified live |
| `9945fe7` | `6bf33ae` | Merge pull request #15 from etvjay/pin-drpc-image |

## Records that cite an old id, and how to read them

- **Nine promoted lab runs** record `df3e9aa` (now `3872dba`) as the commit they ran from: `20261111T220404Z-581c`, `20261111T220705Z-da36`, `20261111T221202Z-d522`, `20261111T221430Z-fdef`, `20261111T221718Z-ace0`, `20261111T222001Z-902c`, `20261111T222226Z-03a5`, `20261111T222555Z-1881` and `20261111T222732Z-fb9b`. Their logs are hash-chained, so the recorded id was not edited. These runs also ran with the compose and provider changes still uncommitted; those changes were committed afterwards as `fb66a89` (now `c990132`).
- **The pinned Roost image** (`sha256:8b24055f…`) carries a GitHub build attestation that names source commit `e8a9357` (now `eeb2b93`, PR #12). The signature is still valid; the old commit id no longer exists in the repository, and the tree it was built from is the tree of `eeb2b93`. The image was not rebuilt, because that would change its digest and compose hash and require attesting again.
- **Pull requests #11 to #15** keep their titles, descriptions and comments. Their commit lists depend on GitHub keeping its old pull-request references, which GitHub Support was asked to remove.

## Limits

- This is not a complete removal until GitHub has removed its cached views and pull-request references. Until then someone who knows an old commit id can still fetch the files. The repository had no forks.
- Anyone who cloned between 2026-11-11 21:24 UTC and the rewrite holds the old history.
