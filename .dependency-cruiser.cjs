/** Module rules. Today there are no import cycles, so any new one fails. The boundaries keep the two services that ship in images from reaching into each other. */
module.exports = {
  forbidden: [
    { name: 'no-circular', severity: 'error', comment: 'An import cycle makes load order matter.', from: {}, to: { circular: true } },
    {
      name: 'roost-service-does-not-import-playground',
      severity: 'error',
      comment: 'The room is attested and its image is built from a short list of files. It must not depend on the playground service.',
      from: { path: '^src/roost-service' },
      to: { path: '^src/playground' },
    },
    {
      name: 'enclave-does-not-import-playground',
      severity: 'error',
      comment: 'The enclave code is shared by the room and must not depend on the playground service.',
      from: { path: '^src/enclave' },
      to: { path: '^src/playground' },
    },
  ],
  options: { doNotFollow: { path: 'node_modules' }, exclude: { path: '\\.bundle\\.js$' }, tsPreCompilationDeps: false },
};
