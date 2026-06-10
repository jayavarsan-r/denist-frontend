const EPSILON = 0.011; // tolerate sub-paisa float noise
function outstandingFor(plan = {}) {
  const est = parseFloat(plan.estimated_cost || 0) || 0;
  const got = parseFloat(plan.collected_amount || 0) || 0;
  return Math.max(0, est - got);
}
function isOverpayment(amount, outstanding) {
  return parseFloat(amount) > parseFloat(outstanding) + EPSILON;
}
module.exports = { outstandingFor, isOverpayment, EPSILON };
