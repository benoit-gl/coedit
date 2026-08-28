/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-unresolved",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "no-production-to-tests",
      severity: "error",
      from: { pathNot: "\\.(?:test|spec)\\.[cm]?[jt]sx?$" },
      to: { path: "\\.(?:test|spec)\\.[cm]?[jt]sx?$" },
    },
    {
      name: "domain-does-not-depend-on-outer-source",
      severity: "error",
      from: { path: "^src/domain(?:/|$)" },
      to: { path: "^src/(?!domain(?:/|$))" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
  },
};
