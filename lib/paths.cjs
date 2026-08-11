const { isAbsolute, normalize, relative } = require('node:path');

const toRelativePath = (file) => {
  const value = isAbsolute(file)
    ? relative(process.cwd(), file)
    : file;

  return normalize(value)
    .replaceAll('\\', '/')
    .replace(/^\.\//, '');
};

const startOfToday = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
};

module.exports = {
  startOfToday,
  toRelativePath,
};
