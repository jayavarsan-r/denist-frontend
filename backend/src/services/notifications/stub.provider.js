// Default provider: pretends to send and returns a synthetic id. Swap for a real
// Twilio/WATI provider later; the interface { send(ctx) } is fixed.
module.exports = {
  name: 'stub',
  async send({ to, channel, type }) {
    return { providerMessageId: `stub-${type}-${channel}-${Date.now()}` };
  },
};
