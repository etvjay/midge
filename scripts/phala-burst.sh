#!/usr/bin/env bash
# Deploy the hosted Roost to Phala for a SHORT, capped session, verify it, then delete it.
#
#   scripts/phala-burst.sh [--hours 3] [--image <ref@sha256:digest>] [--hold] [--url <override>] [--dry-run]
#   --image uses a temporary compose file with that image reference instead of the one in the repo.
#
# STATUS: UNTESTED against the real Phala API until the first supervised run. Run it with --dry-run first,
# and run the first real session with a person watching.
#
# Money safety (the credit is small):
#   * billing is per second, so the session is capped by --hours (default 3, hard maximum 12)
#   * a detached dead-man's switch deletes the CVM at the deadline EVEN IF THIS SCRIPT IS KILLED
#   * an EXIT/INT/TERM trap deletes the CVM on the way out
#   * production OS image only (no SSH), public logs off, smallest instance, smallest disk
#
# Needs in .env (gitignored; never printed): PHALA_CLOUD_API_KEY
# Needs: the `phala` CLI (npx phala@1.2.0 is used), docker, and an image digest in deploy/roost/docker-compose.yml.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

HOURS=3; HOLD=0; DRY=0; URL_OVERRIDE=""; IMAGE_REF=""
while [ $# -gt 0 ]; do
  case "$1" in
    --hours) HOURS="$2"; shift 2 ;;
    --hold) HOLD=1; shift ;;
    --url) URL_OVERRIDE="$2"; shift 2 ;;
    --image) IMAGE_REF="$2"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done
if ! [[ "$HOURS" =~ ^[0-9]+$ ]] || [ "$HOURS" -lt 1 ] || [ "$HOURS" -gt 12 ]; then echo "--hours must be 1 to 12" >&2; exit 2; fi

COMPOSE=deploy/roost/docker-compose.yml
OS_IMAGE="${PHALA_OS_IMAGE:-dstack-0.6.1}"       # production, non-dev; must match roost.expected.json
INSTANCE="${PHALA_INSTANCE:-tdx.small}"
VERIFIER_IMAGE="${VERIFIER_IMAGE:-ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41}"
STATE="${MIDGE_STATE_DIR:-$HOME/.midge-phala}"
PHALA=(npx --yes phala@1.2.0)
MAX_SECONDS=$((HOURS * 3600))

run() { if [ "$DRY" = 1 ]; then echo "[dry-run] $*"; else "$@"; fi; }

mkdir -p "$STATE"; chmod 700 "$STATE"
if [ -n "$IMAGE_REF" ]; then
  [[ "$IMAGE_REF" == *@sha256:* ]] || { echo "--image must be pinned by digest (name@sha256:...)" >&2; exit 2; }
  TMP_COMPOSE="$(mktemp "$STATE/compose.XXXXXX")"
  sed "s|image: .*midge-roost@sha256:REPLACE_WITH_PUSHED_DIGEST|image: $IMAGE_REF|" "$COMPOSE" > "$TMP_COMPOSE"
  COMPOSE="$TMP_COMPOSE"
fi

# --- preconditions
if grep -q "REPLACE_WITH_PUSHED_DIGEST" "$COMPOSE"; then echo "[stop] $COMPOSE still has the placeholder image digest. Push the image first." >&2; [ "$DRY" = 1 ] || exit 1; fi
if [ "$DRY" != 1 ]; then
  KEY="$(grep -E '^PHALA_CLOUD_API_KEY=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d "\"'")"
  [ -n "$KEY" ] || { echo "[stop] PHALA_CLOUD_API_KEY is not set in .env" >&2; exit 1; }
  export PHALA_CLOUD_API_KEY="$KEY"
fi

# --- coordinator key: generated here, kept outside the repo, sent to the CVM as an encrypted env var
ADMIN_KEY_FILE="$STATE/roost-admin.key"
if [ ! -f "$ADMIN_KEY_FILE" ]; then ( umask 077; openssl rand -hex 24 > "$ADMIN_KEY_FILE" ); fi
ENV_FILE="$(mktemp "$STATE/env.XXXXXX")"; chmod 600 "$ENV_FILE"
echo "ROOST_ADMIN_KEY=$(cat "$ADMIN_KEY_FILE")" > "$ENV_FILE"

CVM_ID=""; DEADMAN_PID=""
cleanup() {
  rc=$?
  rm -f "$ENV_FILE" "${TMP_COMPOSE:-}" "${TMP_EXPECTED:-}"
  if [ -n "$DEADMAN_PID" ]; then kill -- "-$DEADMAN_PID" 2>/dev/null || kill "$DEADMAN_PID" 2>/dev/null || true; fi
  if [ -n "$CVM_ID" ] && [ "$DRY" != 1 ]; then
    echo "[cleanup] deleting CVM $CVM_ID"
    "${PHALA[@]}" cvms delete "$CVM_ID" --yes >/dev/null 2>&1 || echo "[cleanup] DELETE FAILED: delete $CVM_ID by hand in the Phala dashboard NOW" >&2
  fi
  exit $rc
}
trap cleanup EXIT INT TERM

NAME="midge-roost-$(date +%m%d-%H%M)"
echo "[1/5] Deploying $NAME ($INSTANCE, $OS_IMAGE, 20G disk, public logs off), capped at ${HOURS}h"
if [ "$DRY" = 1 ]; then
  echo "[dry-run] ${PHALA[*]} deploy -n $NAME -c $COMPOSE -t $INSTANCE --image $OS_IMAGE --disk-size 20G --no-dev-os --no-public-logs --wait -j -e <env file with ROOST_ADMIN_KEY>"
  echo "[dry-run] dead-man's switch: sleep $MAX_SECONDS; ${PHALA[*]} cvms delete <id> --yes"
  echo "[dry-run] verify: node scripts/verify-hosted-roost.js --url <cvm url> --verifier http://127.0.0.1:18080 --save-bundle "$STATE/last-bundle.json" --evidence docs/canonical/roost-hosted-evidence.json"
  echo "[dry-run] done; nothing was deployed and nothing costs money"
  exit 0
fi
OUT="$("${PHALA[@]}" deploy -n "$NAME" -c "$COMPOSE" -t "$INSTANCE" --image "$OS_IMAGE" --disk-size 20G --no-dev-os --no-public-logs --wait -j -e "$ENV_FILE")"
CVM_ID="$(printf '%s' "$OUT" | python3 -c "import sys,json,re
t=sys.stdin.read(); i=t.find('{'); d=json.loads(t[i:])
def find(o,keys):
    if isinstance(o,dict):
        for k,v in o.items():
            if k in keys and isinstance(v,str): return v
            r=find(v,keys)
            if r: return r
    if isinstance(o,list):
        for v in o:
            r=find(v,keys)
            if r: return r
print(find(d,('id','cvm_id','app_id','uuid')) or '')")"
[ -n "$CVM_ID" ] || { echo "[stop] could not read the CVM id from the deploy output; check the Phala dashboard and delete any VM by hand" >&2; exit 1; }
echo "      CVM id: $CVM_ID"

# --- dead-man's switch: survives this script being killed. It inherits the API key from the environment
#     (never from its command line) and runs in its own process group so cleanup can kill it cleanly.
nohup setsid bash -c "sleep $MAX_SECONDS; npx --yes phala@1.2.0 cvms delete '$CVM_ID' --yes" >/dev/null 2>&1 &
DEADMAN_PID=$!
echo "      dead-man's switch armed: the CVM is deleted at +${HOURS}h no matter what"

# keep the provider's answers (mode 600, outside the repo) so a failure can be diagnosed afterwards
printf '%s' "$OUT" > "$STATE/last-deploy.json"; chmod 600 "$STATE/last-deploy.json"
"${PHALA[@]}" cvms get "$CVM_ID" -j > "$STATE/last-cvm.json" 2>/dev/null || true; chmod 600 "$STATE/last-cvm.json"
python3 - "$STATE/last-deploy.json" "$STATE/last-cvm.json" <<'PY'
import json,sys
def shape(o,d=0):
    if isinstance(o,dict): return {k:(shape(v,d+1) if d<2 else type(v).__name__) for k,v in o.items()}
    if isinstance(o,list): return [shape(o[0],d+1)] if o else []
    return type(o).__name__
for f in sys.argv[1:]:
    try:
        t=open(f).read(); d=json.loads(t[t.find('{'):]); print('      shape of',f.split('/')[-1],':',json.dumps(shape(d))[:600])
    except Exception as e: print('      could not read',f,e)
PY

# --- find the public URL
URL="$URL_OVERRIDE"
if [ -z "$URL" ]; then
  URL="$("${PHALA[@]}" cvms get "$CVM_ID" -j 2>/dev/null | python3 -c "import sys,json,re
t=sys.stdin.read(); m=re.findall(r'https://[A-Za-z0-9.-]+-8080[A-Za-z0-9.-]*', t); print(m[0] if m else '')")"
fi
[ -n "$URL" ] || { echo "[stop] could not find the Roost URL; rerun with --url" >&2; exit 1; }
echo "[2/5] Waiting for $URL/healthz"
for i in $(seq 1 60); do curl -fsS -m 5 "$URL/healthz" >/dev/null 2>&1 && break; sleep 5; done
curl -fsS -m 5 "$URL/healthz" >/dev/null || { echo "[stop] the Roost did not come up" >&2; exit 1; }

echo "[3/5] Starting the official dstack-verifier (locked down)"
docker rm -f midge-dstack-verifier >/dev/null 2>&1 || true
docker run -d --name midge-dstack-verifier --read-only --cap-drop ALL --security-opt no-new-privileges --pids-limit 256 --memory 1g --tmpfs /tmp:size=600m -p 127.0.0.1:18080:8080 "$VERIFIER_IMAGE" >/dev/null
for i in $(seq 1 20); do curl -fsS -m 3 http://127.0.0.1:18080/health >/dev/null 2>&1 && break; sleep 2; done

echo "[4/5] Verifying the Roost as a member would"
EXPECTED=roost.expected.json
if python3 -c "import json,sys; v=json.load(open('roost.expected.json')).get('composeHash'); sys.exit(0 if v else 1)"; then :; else
  CH="$(node scripts/compose-hash.js --cvm-json "$STATE/last-cvm.json" --compose "$COMPOSE" || true)"
  [ -n "$CH" ] || { echo "[stop] could not derive the compose hash from the provider's app-compose (see $STATE/last-cvm.json)" >&2; exit 1; }
  echo "      [pin] derived from our compose file: $CH"
  printf '%s' "$CH" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get('ok') and d.get('matchesOurCompose') else 1)" || { echo "[stop] the provider's app-compose does not contain our compose file unchanged" >&2; exit 1; }
  TMP_EXPECTED="$(mktemp "$STATE/expected.XXXXXX")"
  printf '%s' "$CH" | python3 -c "import sys,json; c=json.load(sys.stdin)['candidates']; d=json.load(open('roost.expected.json')); d['composeHash']=c; json.dump(d,open('$TMP_EXPECTED','w'))"
  EXPECTED="$TMP_EXPECTED"
fi
node scripts/verify-hosted-roost.js --url "$URL" --verifier http://127.0.0.1:18080 --expected "$EXPECTED" --save-bundle "$STATE/last-bundle.json" --evidence "$STATE/last-evidence.json" || { echo "[stop] verification FAILED; deleting the CVM" >&2; exit 1; }

cp "$STATE/last-evidence.json" docs/canonical/roost-hosted-evidence.json
echo "      evidence written to docs/canonical/roost-hosted-evidence.json (only a passing run writes it)"

if [ "$HOLD" = 1 ]; then
  echo "[5/5] Holding the CVM up. Roost: $URL  Coordinator key file: $ADMIN_KEY_FILE"
  echo "      Press Enter to delete it now (it is deleted automatically in at most ${HOURS}h)."
  read -r _ || true
fi
echo "[done] cleaning up"
docker rm -f midge-dstack-verifier >/dev/null 2>&1 || true
