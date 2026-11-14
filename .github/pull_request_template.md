## What changed and why

## Change class
Pick one. The classes are defined in CONTRIBUTING.md.
- [ ] A: no effect on any image or WASM (docs, tests, CI, config, scripts, the site)
- [ ] B: changes staged JavaScript, or the root `package.json` or `package-lock.json`, so merging publishes a new image
- [ ] C: changes Rust source, `Cargo.toml` or `Cargo.lock` of a contract or a program, so the WASM hash may change

## Verification
Commands you ran and what they printed, for example `npm run verify:fast` (600 tests) and `./scripts/verify`.

## Pins
- [ ] This does not edit a compose file, an image digest, `roost.expected.json` or `docs/canonical/deployments.json`, or a redeploy plan is attached
- [ ] No key, token or private address is in the diff
