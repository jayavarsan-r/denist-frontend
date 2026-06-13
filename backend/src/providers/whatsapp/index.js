const { assertProvider, normalisePhone } = require('./whatsapp.adapter');
const stub = require('./stub.whatsapp.provider');
const aisensy = require('./aisensy.whatsapp.provider');
const meta = require('./meta-cloud.provider');

const PROVIDERS = { stub, aisensy, meta };

// WHATSAPP_PROVIDER selects the implementation (default: stub). Read at call
// time so tests and config changes need no restart. Going live = config change.
function getWhatsAppProvider() {
  const name = (process.env.WHATSAPP_PROVIDER || 'stub').toLowerCase();
  const provider = PROVIDERS[name];
  if (!provider) throw new Error(`Unknown WHATSAPP_PROVIDER '${name}' (expected: ${Object.keys(PROVIDERS).join(' | ')})`);
  return assertProvider(provider, name);
}

module.exports = { getWhatsAppProvider, normalisePhone };
