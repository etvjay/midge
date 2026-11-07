# Site deployments (midge.vercel.app)

Vercel project `midge` (team jaydearcadians-projects), deployed from `site/` with the Vercel CLI. Vercel keeps every deployment; the main domain points at one of them.

| When (UTC) | Deployment | Git commit | What | Where |
|---|---|---|---|---|
| 2026-11-07 14:00 | `midge-8dz7djyfk-jaydearcadians-projects.vercel.app` | `f7fda35` | The release-cap fix (GAP-024) and its limit stated in real time (a window is twice the exit timer; the limit is only as strict as the timer); the live contract check expects `DNZDmhLR…`; 320 recorded transactions | **https://midge.vercel.app** (current) |
| 2026-11-07 13:35 | `midge-aftuxtogk-jaydearcadians-projects.vercel.app` | `c7d78e9` | Ongoing groups listed as run; the release-cap limit stated on the page (GAP-024: the cap bounds each payment, not the pace); 309 recorded transactions; the live contract check expects `6Jt4kSPX…` | per-deployment URL |
| 2026-11-07 13:10 | `midge-kgbfeab2x-jaydearcadians-projects.vercel.app` | `56e9dca` | Requests for quote in both directions listed as run next to an open RFQ; 300 recorded transactions; the live contract check expects `6Jt4kSPX…` | per-deployment URL |
| 2026-11-07 12:35 | `midge-c3pevrrqq-jaydearcadians-projects.vercel.app` | `574a02d` | Payroll listed as run next to a public pay run, with what it hides (who is paid, receipts) and what it does not (amounts; a person is still linkable across months by amount); 296 recorded transactions; the live contract check expects `6Jt4kSPX…` | per-deployment URL |
| 2026-11-07 12:15 | `midge-14cxhk5hb-jaydearcadians-projects.vercel.app` | `b849326` | Payroll described as private who with private receipts (amounts public); voting listed as run next to an open poll and a multisig; 282 recorded transactions; the live contract check expects `6Jt4kSPX…` | per-deployment URL |
| 2026-11-07 11:20 | `midge-36lw4bf4v-jaydearcadians-projects.vercel.app` | `cac891b` | Lending quotes and block trades listed as run on testnet next to open versions, with their limits; 278 recorded transactions; the live contract check expects `6Jt4kSPX…` | per-deployment URL |
| 2026-11-07 10:07 | `dpl_3ngHuC2dsGpEk2t4HWpqvgejcNYt` (midge-fe3w2xd1w-jaydearcadians-projects.vercel.app) | `ef8272b` | One vocabulary (private rooms with public rules); the live contract check expects `6Jt4kSPX…` (the GAP-008 fix); the exit condition stated plainly; eight use cases with their real status; 272 recorded transactions | per-deployment URL |
| 2026-11-07 07:11 | `dpl_9YN6rYJ1edqR4L4mtCBJnLg3UgyB` (midge-jmpsvgqkl-jaydearcadians-projects.vercel.app) | `4562f1f` | The live contract check expects `4Zzj8DuT…` (per-member charges); sealed-auction comparison and its limits; 258 recorded transactions | per-deployment URL |
| 2026-11-05 04:30 | `dpl_5Ywc8Ud6QccjybCVKf1G3YV7j4Wt` (midge-mdm9se8hs-jaydearcadians-projects.vercel.app) | `e3ce257` | The live contract check expects the redeployed contract (`9y8w4PU5…`); investing-together comparison and its limit; 244 recorded transactions | per-deployment URL |
| 2026-11-05 03:28 | `dpl_FL9dwxPt4SwnPynsxz87u3U6fwcJ` (midge-aatvw023d-jaydearcadians-projects.vercel.app) | `874e3bc` | The combined run listed as running; 208 recorded transactions | per-deployment URL |
| 2026-11-05 02:59 | `dpl_CmscZWf6qi7boPaq7PPq2SK28vuz` (midge-hb8qdirs4-jaydearcadians-projects.vercel.app) | `46bf913` | The rebuilt site: simpler page, rendered hero with live 3D, plates, drawings, proof grid | per-deployment URL |
| 2026-11-04 10:39 | `dpl_DHZD6NHro8TEoHnHneK1t5JECY1s` (midge-pqoofqmyr-jaydearcadians-projects.vercel.app) | before the rebuild | The previous site, saved | https://midge-v1.vercel.app (alias) |

The saved alias and the per-deployment URLs sit behind Vercel's deployment protection (they redirect to a Vercel login); only the production domain is public. To make the saved version public as well, turn off protection for it in the project settings, or promote it.

## Roll back to the saved version

```bash
cd site
vercel promote midge-pqoofqmyr-jaydearcadians-projects.vercel.app   # points midge.vercel.app back at the saved deployment
# or: vercel rollback
```

## Deploy

```bash
npm run build:site                 # proof data and the 3D bundle
cd site && vercel deploy --prod    # .vercelignore keeps .env*, src/ and the PNG masters out
```
