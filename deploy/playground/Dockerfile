# Midge playground service, a small Node program that runs the queue, the chain steps and the model call. It runs on its own Phala machine, not inside
# the attested room, because it holds a funding key and the room must not. Build context is staged by deploy/playground/build.sh.
# The base image is pinned by digest, as for the room.
# The model's hardware attestation is checked with dcap-qvl (src/enclave/attestation.js runs `dcap-qvl verify`). Without it every review is refused with
# "no model attestation candidate passed". This stage downloads Phala's prebuilt release v0.7.0 and refuses it unless its sha256 matches, using Node itself so
# that no other tool is needed and any Docker can build it. It is the static musl build, because the glibc build needs a newer libc than this base image has.
FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS dcap
RUN node --input-type=module -e "import { createHash } from 'node:crypto'; import { writeFileSync, chmodSync } from 'node:fs'; \
  const r = await fetch('https://github.com/Phala-Network/dcap-qvl/releases/download/v0.7.0/dcap-qvl-linux-x86_64-musl'); \
  if (!r.ok) { console.error('download failed', r.status); process.exit(1); } \
  const b = Buffer.from(await r.arrayBuffer()); const h = createHash('sha256').update(b).digest('hex'); \
  if (h !== '16a9e5a1302e7bec4245bfeb440283f037168ecc4ae5221bb63418023bcc5540') { console.error('dcap-qvl checksum mismatch', h); process.exit(1); } \
  writeFileSync('/dcap-qvl', b); chmodSync('/dcap-qvl', 0o755);"

FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c

ENV NODE_ENV=production
WORKDIR /app

# dcap-qvl fetches Intel's collateral over HTTPS from Phala's PCCS, and fails with "No CA certificates were loaded from the system" without a CA store.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=dcap /dcap-qvl /usr/local/bin/dcap-qvl

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY src ./src

# The ledger of accounts and groups the service has created and not yet cleaned up lives in /data, which is a volume.
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8090
CMD ["node", "src/playground/main.js"]
