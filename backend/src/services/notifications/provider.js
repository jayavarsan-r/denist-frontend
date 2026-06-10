// Selects the active provider from NOTIFICATION_PROVIDER (default 'stub').
function getProvider() {
  const name = process.env.NOTIFICATION_PROVIDER || 'stub';
  switch (name) {
    case 'stub':
    default:
      return require('./stub.provider');
  }
}
module.exports = { getProvider };
