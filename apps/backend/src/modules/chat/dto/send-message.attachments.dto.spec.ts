import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { SendMessageDto } from './send-message.dto';

const CLIENT_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

async function errorsFor(plain: Record<string, unknown>): Promise<string[]> {
  const instance = plainToInstance(SendMessageDto, plain);
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  return errors.map((error) => error.property);
}

describe('SendMessageDto with attachments', () => {
  describe('text-only messages keep their original rules', () => {
    it('accepts a normal body', async () => {
      expect(
        await errorsFor({ clientMessageId: CLIENT_ID, body: 'hello' }),
      ).toEqual([]);
    });

    it.each([undefined, '', '   ', 42, null])(
      'rejects body %p without an attachment',
      async (body) => {
        expect(await errorsFor({ clientMessageId: CLIENT_ID, body })).toContain(
          'body',
        );
      },
    );

    it('still rejects an over-long body', async () => {
      expect(
        await errorsFor({ clientMessageId: CLIENT_ID, body: 'x'.repeat(4001) }),
      ).toContain('body');
    });

    it('still rejects unknown fields (forbidNonWhitelisted)', async () => {
      expect(
        await errorsFor({
          clientMessageId: CLIENT_ID,
          body: 'hi',
          companyId: 'x',
        }),
      ).toContain('companyId');
    });
  });

  describe('with an attachment', () => {
    it('accepts an attachment-only message (body missing, empty or blank)', async () => {
      for (const body of [undefined, '', '   ']) {
        expect(
          await errorsFor({
            clientMessageId: CLIENT_ID,
            body,
            attachmentId: 'abc_123-XY',
          }),
        ).toEqual([]);
      }
    });

    it('accepts text together with the attachment', async () => {
      expect(
        await errorsFor({
          clientMessageId: CLIENT_ID,
          body: 'see this',
          attachmentId: 'abc',
        }),
      ).toEqual([]);
    });

    it('still validates a non-empty body (length)', async () => {
      expect(
        await errorsFor({
          clientMessageId: CLIENT_ID,
          body: 'x'.repeat(4001),
          attachmentId: 'abc',
        }),
      ).toContain('body');
    });

    it.each(['../etc/passwd', 'a b', 'a/b', '', 'x'.repeat(65), 5])(
      'rejects a malformed attachment id (%p)',
      async (attachmentId) => {
        expect(
          await errorsFor({
            clientMessageId: CLIENT_ID,
            body: 'hi',
            attachmentId,
          }),
        ).toContain('attachmentId');
      },
    );

    it('allows only ONE attachment id (an array is refused)', async () => {
      expect(
        await errorsFor({
          clientMessageId: CLIENT_ID,
          body: 'hi',
          attachmentId: ['a', 'b'],
        }),
      ).toContain('attachmentId');
    });
  });
});
