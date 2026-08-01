import { BadRequestException } from '@nestjs/common';

export class SelectFieldsUtil {
  static build<T extends string>(
    fields: string | undefined,
    allowedFields: readonly T[],
  ) {
    if (!fields) {
      return undefined;
    }

    const requestedFields = fields
      .split(',')
      .map((field) => field.trim())
      .filter(Boolean);

    const invalidFields = requestedFields.filter(
      (field) =>
        !allowedFields.includes(field as T),
    );

    if (invalidFields.length > 0) {
      throw new BadRequestException(
        `Invalid fields: ${invalidFields.join(', ')}`,
      );
    }

    return requestedFields.reduce(
      (select, field) => {
        select[field] = true;
        return select;
      },
      {} as Record<string, true>,
    );
  }
}