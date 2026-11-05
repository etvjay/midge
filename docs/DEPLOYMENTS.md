# Site deployments (midge.vercel.app)

Vercel project `midge` (team jaydearcadians-projects), deployed from `site/` with the Vercel CLI. Vercel keeps every deployment; the main domain points at one of them.

| When (UTC) | Deployment | Git commit | What | Where |
|---|---|---|---|---|
| 2026-11-05 04:30 | `dpl_5Ywc8Ud6QccjybCVKf1G3YV7j4Wt` (midge-mdm9se8hs-jaydearcadians-projects.vercel.app) | `e3ce257` | The live contract check expects the redeployed contract (`9y8w4PU5…`); investing-together comparison and its limit; 244 recorded transactions | per-deployment URL |
| 2026-11-05 03:28 | `dpl_FL9dwxPt4SwnPynsxz87u3U6fwcJ` (midge-aatvw023d-jaydearcadians-projects.vercel.app) | `874e3bc` | The combined run listed as running; 208 recorded transactions | **https://midge.vercel.app** (current) |
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
