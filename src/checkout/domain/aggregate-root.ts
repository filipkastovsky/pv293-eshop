import { DomainEvent } from '../../contracts';

/** An aggregate records what happened; the application publishes it after saving. */
export abstract class AggregateRoot {
  private pending: DomainEvent[] = [];

  protected constructor(public readonly version: number) {}

  protected record(event: DomainEvent): void {
    this.pending.push(event);
  }

  /** Events recorded since the aggregate was loaded; empties the list. */
  pullEvents(): DomainEvent[] {
    const events = this.pending;
    this.pending = [];
    return events;
  }
}
