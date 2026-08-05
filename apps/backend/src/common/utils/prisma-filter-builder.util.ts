import { PaginationQueryDto } from '../dto/pagination-query.dto';

export type FilterDefinition = {
  field: string;
  queryKey: keyof PaginationQueryDto;
};

export class PrismaFilterBuilder {
  static build(
    query: PaginationQueryDto,
    filters: readonly FilterDefinition[],
  ): Record<string, unknown> {
    const where: Record<string, unknown> = {};

    for (const filter of filters) {
      const value = query[filter.queryKey];

      if (value !== undefined) {
        where[filter.field] = value;
      }
    }

    return where;
  }
}
