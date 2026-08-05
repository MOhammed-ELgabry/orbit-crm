import { PaginationQueryDto } from '../dto/pagination-query.dto';
import { PaginationMeta } from '../interfaces/pagination-result.interface';

export class PaginationUtil {
  static getPagination(query: PaginationQueryDto) {
    const page = query.page;
    const limit = query.limit;

    return {
      page,
      limit,
      skip: (page - 1) * limit,
      take: limit,
    };
  }

  static buildMeta(page: number, limit: number, total: number): PaginationMeta {
    return {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPreviousPage: page > 1,
    };
  }
}
