const resetAndTest = (pattern, value) => {
  pattern.lastIndex = 0;
  return pattern.test(value);
};

module.exports = {
  resetAndTest,
};
