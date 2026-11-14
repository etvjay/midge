# Midge playground service, a small Node program that runs the queue, the chain steps and the model call. It runs on its own Phala machine, not inside
# the attested room, because it holds a funding key and the room must not. Build context is staged by deploy/playground/build.sh.
# The base image is pinned by digest, as for the room.
FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY src ./src

# The ledger of accounts and groups the service has created and not yet cleaned up lives in /data, which is a volume.
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8090
CMD ["node", "src/playground/main.js"]
