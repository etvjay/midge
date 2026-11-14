# Playground runbook

This is the order of the human gates for putting the playground live, with the exact commands and what each one costs. Nothing here has been run. Every step that spends money or changes a live system waits for you.

What exists already, tested: the service (`src/playground/`), the page (`site/playground/`), the service image build (`deploy/playground/`, `.github/workflows/playground-image.yml`), and a live experiment written and rehearsed (`lab/pending/139-playground-live.js`). What does not exist yet: the funding account, the two machines, and a passing live run.

Costs: each machine is about $0.058 an hour for compute while running, plus about $0.0028 an hour for its 20 GB disk, which is billed even when the machine is stopped ([Phala pricing](https://cloud.phala.com/about/pricing)). Running both all day is about $3, and the room can sleep when nobody is using it. A round costs the funding account about 0.07 NEAR of testnet coins.

## 0. Before you start

1. The playground branch is merged to `master`. The merge makes CI build the service image. Open the run named "Playground image" in GitHub Actions and copy the line `ghcr.io/etvjay/midge-playground@sha256:...` from its summary. You need the 64 hex characters after `sha256:`.
2. `.env` in the repository holds `NEAR_ACCOUNT_ID`, `NEAR_PRIVATE_KEY`, `NEARAI_API_KEY` and `PHALA_CLOUD_API_KEY` (see `.env.example`).
3. Docker is running, because the live experiment starts the attestation verifier in a container.

## 1. The funding account (spends testnet coins)

```bash
node scripts/playground-funder.mjs --dry-run      # shows what it would do, changes nothing
node scripts/playground-funder.mjs --fund 6       # creates play.<main account> and moves 6 NEAR into it
```

The new key goes to `~/.midge-phala/playground.env` with mode 600, outside the repository. The deployer key is only used to sign the creation, and it never reaches the service. The main account is left with about 3.7 NEAR.

## 2. The room machine (spends about $0.06 an hour)

```bash
mkdir -p ~/.midge-phala && chmod 700 ~/.midge-phala
ROOM_ADMIN_KEY=$(openssl rand -hex 24)
printf 'ROOST_ADMIN_KEY=%s\n' "$ROOM_ADMIN_KEY" > ~/.midge-phala/room.env && chmod 600 ~/.midge-phala/room.env
set -a; . ./.env; set +a
npx --yes phala@1.2.0 deploy -n midge-playground-room -c deploy/roost/docker-compose.yml -t tdx.small \
  --image dstack-0.6.1 --disk-size 20G --no-dev-os --no-public-logs --wait -j -e ~/.midge-phala/room.env
```

The output names the machine (`app_id`). Then read its address and keep both, with the admin key, for the next step:

```bash
npx --yes phala@1.2.0 cvms get <app_id> -j | grep -o 'https://[A-Za-z0-9.-]*-8080[A-Za-z0-9.-]*' | head -1
```

Append these lines to `~/.midge-phala/playground.env` (no spaces around the equals sign):

```
ROOM_URL=<that https address>
ROOM_CVM_ID=<app_id>
ROOM_ADMIN_KEY=<the value of $ROOM_ADMIN_KEY>
NEARAI_API_KEY=<from .env>
PHALA_CLOUD_API_KEY=<from .env>
PLAYGROUND_ORIGIN=https://midge.vercel.app
```

The compose file is the room's, unchanged, so its attested identity is the one already recorded in `roost.expected.json`. Do not stop the room yet. The experiment in step 5 stops it on purpose.

## 3. The service machine (spends about $0.06 an hour)

```bash
cp deploy/playground/docker-compose.yml ~/.midge-phala/playground-compose.yml
sed -i 's/PLAYGROUND_IMAGE_DIGEST/<the 64 hex characters>/' ~/.midge-phala/playground-compose.yml
set -a; . ~/.midge-phala/playground.env; set +a
npx --yes phala@1.2.0 deploy -n midge-playground -c ~/.midge-phala/playground-compose.yml -t tdx.small \
  --image dstack-0.6.1 --disk-size 20G --no-dev-os --no-public-logs --wait -j -e ~/.midge-phala/playground.env
npx --yes phala@1.2.0 cvms get <its app_id> -j | grep -o 'https://[A-Za-z0-9.-]*-8090[A-Za-z0-9.-]*' | head -1
curl -s <that address>/api/health      # expect {"ok":true,...}
```

The service machine is not attested hardware. It holds the funding key, which the room must never hold, and this is stated on the page.

## 4. The live experiment (spends a few cents and some testnet coins)

```bash
git mv lab/pending/139-playground-live.js lab/experiments/139-playground-live.js
PLAYGROUND_URL=<the service address> node lab/run.js --only E-PLAYGROUND-LIVE-01
node lab/promote.js lab/runs/<the run it printed>
```

It stops the room, checks that opening the page wakes it within about 150 seconds, verifies the room's attestation, and then plays the whole flow. A failed run stays local and is described in `docs/lab/PROGRAMME_PLAN.md`, as the others were. After a pass, add its claim (`CLM-PLAYGROUND-LIVE-01`, state LIVE_DEMONSTRATED) next to the local one, record the results, and run `./scripts/verify`.

## 5. The page on the live site (a human gate)

In `site/playground/config.js` set `apiBase` to the service address (keep `contractId`). Then follow the site's usual promotion. Open the page and run one round by hand before telling anyone. The page tells visitors plainly if the service cannot be reached.

## 6. After judging

```bash
npx --yes phala@1.2.0 cvms delete <service app_id> --yes
npx --yes phala@1.2.0 cvms delete <room app_id> --yes
```

Deleting stops the disk charge as well. Then rotate the Phala API key, because the service held it, and ask me to delete the funding account and send what is left back to the main account.

## If something goes wrong

- The page says the room could not be started: the service wakes the room through Phala's API, and a failed start is not retried for 30 seconds. Check the room machine in the Phala dashboard.
- A round failed part-way: the service cleans up in the background and retries unfinished cleanups every five minutes from its ledger. `node scripts/playground-funder.mjs --dry-run` shows the funding balance, and the contract's group count should be back to its starting value.
- The funding balance is low: the service refuses new rounds below 2 NEAR and says so on the page. Fund the account again by hand.
