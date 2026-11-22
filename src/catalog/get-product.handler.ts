import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetProduct, ProductView } from '../contracts';
import { CatalogService } from './catalog.service';

/** The public query other modules ask over the QueryBus. */
@QueryHandler(GetProduct)
export class GetProductHandler implements IQueryHandler<GetProduct> {
  constructor(private readonly catalog: CatalogService) {}

  execute(query: GetProduct): Promise<ProductView | null> {
    return this.catalog.find(query.sku);
  }
}
