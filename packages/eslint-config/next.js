module.exports = {
  extends: [
    'eslint-config-turbo',
    'eslint-config-next'
  ].map(require.resolve)
};