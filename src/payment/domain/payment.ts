export type PaymentStatus = 'initiated' | 'succeeded' | 'failed';

/** A payment attempt for one order. Pure state machine: no Nest, no database. */
export class Payment {
  private constructor(
    readonly id: string,
    readonly orderId: string,
    readonly amount: number,
    private currentStatus: PaymentStatus,
    private currentReason: string | null,
  ) {}

  static initiate(id: string, orderId: string, amount: number): Payment {
    return new Payment(id, orderId, amount, 'initiated', null);
  }

  static restore(
    id: string,
    orderId: string,
    amount: number,
    status: PaymentStatus,
    reason: string | null,
  ): Payment {
    return new Payment(id, orderId, amount, status, reason);
  }

  get status(): PaymentStatus {
    return this.currentStatus;
  }

  get failureReason(): string | null {
    return this.currentReason;
  }

  succeed(): void {
    this.requireInitiated();
    this.currentStatus = 'succeeded';
  }

  fail(reason: string): void {
    this.requireInitiated();
    this.currentStatus = 'failed';
    this.currentReason = reason;
  }

  private requireInitiated(): void {
    if (this.currentStatus !== 'initiated') {
      throw new Error(`Payment ${this.id} is already ${this.currentStatus}`);
    }
  }
}
