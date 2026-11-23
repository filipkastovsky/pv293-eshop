/** A command that the current state does not allow (HTTP 409 at the edge). */
export class CheckoutRuleViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckoutRuleViolation';
  }
}
