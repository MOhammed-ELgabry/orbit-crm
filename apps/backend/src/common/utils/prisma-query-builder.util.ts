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

    // baseWhere carries trust-boundary conditions a caller passes directly
    // (companyId scoping, deletedAt, an id equality check, ...) — never
    // something derived from the request. Everything else in this method
    // is influenced by client-controlled query params (filters, search),
    // so those are computed into their own object first and baseWhere is
    // spread in LAST, guaranteeing it always wins on any key collision.
    // This is defense in depth: today no FilterDefinition happens to
    // target a baseWhere key, but nothing structurally prevented a future
    // one from doing so and silently overriding tenant scoping — this
    // makes that class of mistake inert instead of exploitable.
    const derivedWhere: Record<string, unknown> = {};

    if (options.filters?.length) {
      Object.assign(
        derivedWhere,
        PrismaFilterBuilder.build(query, options.filters),
      );
    }

    if (query.search && options.searchableFields.length > 0) {
      derivedWhere.OR = options.searchableFields.map((field) => ({
        [field]: {
          contains: query.search,
          mode: 'insensitive',
        },
      }));
    }

    const where: Record<string, unknown> = {
      ...derivedWhere,
      ...baseWhere,
    };

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
