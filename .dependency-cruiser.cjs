module.exports = {
  forbidden: [
    { name: 'no-cycles', severity: 'error', from: {}, to: { circular: true } },
    { name: 'no-unresolved', severity: 'error', from: {}, to: { couldNotResolve: true } },
    {
      name: 'domain-only-domain',
      severity: 'error',
      from: { path: '^src/domain/' },
      to: { pathNot: '^src/domain/' },
    },
    {
      name: 'application-only-domain-and-application',
      severity: 'error',
      from: { path: '^src/application/' },
      to: { pathNot: '^src/(application|domain)/' },
    },
    {
      name: 'presentation-no-infrastructure',
      severity: 'error',
      from: { path: '^src/features/' },
      to: { path: '^src/(infrastructure|app)/' },
    },
    {
      name: 'presentation-no-api-or-database-sdk',
      severity: 'error',
      from: { path: '^src/(features/|app/App\\.tsx$)' },
      to: { path: '(^|/)(openai|idb|dexie)(/|$)' },
    },
    {
      name: 'infrastructure-no-presentation',
      severity: 'error',
      from: { path: '^src/infrastructure/' },
      to: { path: '^src/(features|app)/' },
    },
    {
      name: 'composition-root-only',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/(infrastructure/|app/create-services\\.ts$)' },
      to: { path: '^src/infrastructure/' },
    },
    ...['reader', 'vocabulary', 'grammar', 'history', 'settings'].map((feature) => ({
      name: `${feature}-no-other-features`,
      severity: 'error',
      from: { path: `^src/features/${feature}/` },
      to: { path: '^src/features/', pathNot: `^src/features/${feature}/` },
    })),
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.css'],
      conditionNames: ['import', 'browser', 'default'],
    },
  },
};
