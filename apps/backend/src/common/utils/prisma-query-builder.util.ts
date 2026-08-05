import { PaginationQueryDto } from '../dto/pagination-query.dto';
import { PaginationUtil } from './pagination.util';
import {
  FilterDefinition,
  PrismaFilterBuilder,
} from './prisma-filter-builder.util';
import { SelectFieldsUtil } from './select-fields.util';

type QueryBuilderOptions = {
  searchableFields: readonly string[];
  sortableFields: readonly string[];
  selectableFields: readonly string[];
  filters?: readonly FilterDefinition[];
};

export class PrismaQueryBuilder {
  static build(
    query: PaginationQueryDto,
    options: QueryBuilderOptions,
    baseWhere: Record<string, unknown> = {},
  ) {
    const { skip, take } = PaginationUtil.getPagination(query);

    const where: Record<string, unknown> = {
      ...baseWhere,
    };

    if (options.filters?.length) {
      Object.assign(where, PrismaFilterBuilder.build(query, options.filters));
    }

    if (query.search && options.searchableFields.length > 0) {
      where.OR = options.searchableFields.map((field) => ({
        [field]: {
          contains: query.search,
          mode: 'insensitive',
        },
      }));
    }

    const sortBy =
      query.sortBy && options.sortableFields.includes(query.sortBy)
        ? query.sortBy
        : 'createdAt';

    const orderBy = {
      [sortBy]: query.sortOrder,
    };

    const select = SelectFieldsUtil.build(
      query.fields,
      options.selectableFields,
    );

    return {
      where,
      orderBy,
      select,
      skip,
      take,
    };
  }
}
