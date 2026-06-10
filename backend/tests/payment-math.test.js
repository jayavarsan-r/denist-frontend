const { outstandingFor, isOverpayment } = require('../src/utils/payment-math');

describe('payment-math', () => {
  test('outstandingFor never goes negative', () => {
    expect(outstandingFor({ estimated_cost: 2000, collected_amount: 1000 })).toBe(1000);
    expect(outstandingFor({ estimated_cost: 2000, collected_amount: 2500 })).toBe(0);
    expect(outstandingFor({ estimated_cost: null, collected_amount: null })).toBe(0);
  });
  test('isOverpayment respects a 1-paisa epsilon', () => {
    expect(isOverpayment(1000.005, 1000)).toBe(false); // within epsilon
    expect(isOverpayment(1000.02, 1000)).toBe(true);
    expect(isOverpayment(1000, 1000)).toBe(false);     // exact payoff allowed
    expect(isOverpayment(500, 1000)).toBe(false);
  });
});
