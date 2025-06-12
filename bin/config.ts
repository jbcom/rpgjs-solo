export const packages = (type: "build" | "dev") => {
  const buildScript = type === "build" ? "build" : "dev";
  const basePath = "packages";
  const samplePath = "sample";
  return [
    {
      name: "vite",
      buildScript
    },
    {
      name: "tiled",
      buildScript
    },
    {
      name: "common",
      buildScript
    },
    {
      name: "client",
      buildScript,
      dependencies: [`${basePath}/common/dist/index.d.ts`],
    },
    {
      name: "server",
      buildScript,
      dependencies: [`${basePath}/common/dist/index.d.ts`],
    },
    {
      name: "tiledmap",
      buildScript,
      dependencies: [
        `${basePath}/common/dist/index.d.ts`,
        `${basePath}/tiled/dist/index.d.ts`,
        `${basePath}/server/dist/index.d.ts`,
        `${basePath}/client/dist/index.d.ts`,
        `${basePath}/vite/dist/index.d.ts`,
      ],
    },
    {
      name: samplePath,
      buildScript,
      dependencies: [
        `${samplePath}/client/dist/index.d.ts`,
        `${samplePath}/server/dist/index.d.ts`,
        `${samplePath}/vite/dist/index.d.ts`,
        `${samplePath}/tiled/dist/index.d.ts`,
        `${samplePath}/tiledmap/dist/index.d.ts`,
      ],
    },
  ];
};
