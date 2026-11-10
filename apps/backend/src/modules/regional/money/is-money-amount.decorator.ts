import { registerDecorator, type ValidationOptions } from 'class-validator';

import { normalizeMoneyInput } from './money.util';

/** The value must be a valid money amount (see normalizeMoneyInput). */
export function IsMoneyAmount(options?: ValidationOptions) {
  return (target: object, propertyName: string) => {
    registerDecorator({
      name: 'isMoneyAmount',
      target: target.constructor,
      propertyName,
      options: {
        message:
          'amount must be a non-negative decimal with at most 15 integer digits and 4 decimal places.',
        ...options,
      },
      validator: {
        validate: (value: unknown) => normalizeMoneyInput(value) !== null,
      },
    });
  };
}
