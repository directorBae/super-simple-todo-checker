const base = require('./package.json').build;
module.exports = {
  ...base,
  directories: { ...base.directories, output: 'release/demo' },
  extraMetadata: { demoBuild: true },
  nsis: { ...base.nsis, artifactName: 'todo-checker-demo-Setup-${version}.${ext}' },
};
