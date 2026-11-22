import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { DomainError } from '../domain/errors';

const toHttp: Record<DomainError['kind'], (m: string) => HttpException> = {
  invalid: (m) => new BadRequestException(m),
  not_found: (m) => new NotFoundException(m),
  conflict: (m) => new ConflictException(m),
};

/** Translates a broken business rule into an HTTP status. */
@Catch(DomainError)
export class DomainErrorFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  catch(error: DomainError, host: ArgumentsHost): void {
    super.catch(toHttp[error.kind](error.message), host);
  }
}
