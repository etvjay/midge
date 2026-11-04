# Midge hosted Roost, minimal image for a dstack confidential VM.
# Build context is staged by deploy/roost/build.sh (never the whole repository).
# The base image is pinned by digest so the measured compose file identifies exactly this runtime.
FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY src ./src

# Run as the unprivileged user that ships with the base image. No shell entrypoint, no debug tooling.
USER node
EXPOSE 8080
CMD ["node", "src/roost-service/server.js"]
