import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { catchError, Observable, throwError } from 'rxjs';
import { CheckoutRuleViolation } from '../../domain/checkout-rule-violation';

/** A broken business rule is a 409 at the HTTP edge. */
@Injectable()
export class RuleViolationInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next
      .handle()
      .pipe(
        catchError((err) =>
          throwError(() =>
            err instanceof CheckoutRuleViolation
              ? new ConflictException(err.message)
              : err,
          ),
        ),
      );
  }
}
