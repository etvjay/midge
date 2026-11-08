// Preload for diagnosing offline behaviour: every request to the NEAR AI Cloud host answers HTTP 503, everything else is untouched.
const real = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input?.url || input);
  if (/cloud-api\.near\.ai/.test(url)) return new Response('service unavailable', { status: 503 });
  return real(input, init);
};
