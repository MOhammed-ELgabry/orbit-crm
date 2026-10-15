import {
  buildNotificationPath,
  renderNotification,
  renderNotificationEmail,
  renderPushPayload,
  sanitizeChatSnippet,
} from './notification.templates';

describe('chat notification templates', () => {
  describe('sanitizeChatSnippet', () => {
    it('returns an empty string for non-strings and blank input', () => {
      expect(sanitizeChatSnippet(undefined)).toBe('');
      expect(sanitizeChatSnippet(null)).toBe('');
      expect(sanitizeChatSnippet(42)).toBe('');
      expect(sanitizeChatSnippet('   \n\t  ')).toBe('');
    });

    it('collapses whitespace and line breaks into single spaces', () => {
      expect(sanitizeChatSnippet('  a \r\n\r\n b\t\tc  ')).toBe('a b c');
    });

    it('turns control and bidi-override characters into spaces and removes invisible ones', () => {
      // NUL, RLO and LRI become spaces; ZWSP, RLM, BOM and soft hyphen vanish.
      const dirty =
        'ab\u0000c\u202ed\u2066e\u200bf\u200fg\ufeffh\u00adi\u2028j';
      expect(sanitizeChatSnippet(dirty)).toBe('ab c d efghi j');
    });

    it('keeps ZWNJ and ZWJ: they are part of legitimate text', () => {
      expect(sanitizeChatSnippet('می\u200cخواهم')).toBe('می\u200cخواهم');
      expect(sanitizeChatSnippet('👨\u200d👩\u200d👧')).toBe(
        '👨\u200d👩\u200d👧',
      );
    });

    it('drops lone surrogates but keeps valid emoji', () => {
      expect(sanitizeChatSnippet('a\ud800b\udc00c')).toBe('abc');
      expect(sanitizeChatSnippet('ok 😀')).toBe('ok 😀');
    });

    it('normalises to NFC (composed and decomposed forms are equal)', () => {
      const decomposed = 'é'; // e + combining acute
      expect(sanitizeChatSnippet(decomposed)).toBe('é');
    });

    it('keeps text up to the limit untouched', () => {
      const text = 'x'.repeat(80);
      expect(sanitizeChatSnippet(text)).toBe(text);
    });

    it('truncates to at most 80 characters, ending with an ellipsis', () => {
      const out = sanitizeChatSnippet('x'.repeat(500));
      expect(Array.from(out)).toHaveLength(80);
      expect(out.endsWith('…')).toBe(true);
    });

    it('never cuts an emoji sequence or an Arabic letter with its marks in half', () => {
      const family = '👨‍👩‍👧‍👦'; // one grapheme, many code points
      const out = sanitizeChatSnippet(family.repeat(200));
      expect(out.endsWith('…')).toBe(true);
      // 79 whole families + the ellipsis.
      expect(out).toBe(`${family.repeat(79)}…`);

      const arabic = 'مَرْحَبًا ';
      const arabicOut = sanitizeChatSnippet(arabic.repeat(100));
      expect(arabicOut.endsWith('…')).toBe(true);
      // Every grapheme is intact: no segment starts with a lone mark.
      const parts = Array.from(
        new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
          arabicOut,
        ),
        (p) => p.segment,
      );
      expect(parts.length).toBeLessThanOrEqual(80);
      for (const part of parts) expect(part).not.toMatch(/^[ً-ْ]/u);
    });

    it('is idempotent (safe to apply when storing and when rendering)', () => {
      const once = sanitizeChatSnippet('y'.repeat(300));
      expect(sanitizeChatSnippet(once)).toBe(once);

      const emoji = sanitizeChatSnippet('😀'.repeat(300));
      expect(sanitizeChatSnippet(emoji)).toBe(emoji);
    });

    it('does not interpret markup: the text is returned as plain characters', () => {
      expect(sanitizeChatSnippet('<img src=x onerror=alert(1)>')).toBe(
        '<img src=x onerror=alert(1)>',
      );
    });
  });

  describe('renderNotification (chat.message)', () => {
    const base = { actorName: 'Alice Smith', snippet: 'See you at 5' };

    it('DIRECT, English: actor and snippet in the body', () => {
      const out = renderNotification('chat.message', 'en', {
        ...base,
        conversationType: 'DIRECT',
      });

      expect(out).toEqual({
        title: 'New message',
        body: 'Alice Smith: See you at 5',
      });
    });

    it('DIRECT, Arabic', () => {
      const out = renderNotification('chat.message', 'ar', {
        actorName: 'علي أحمد',
        snippet: 'أراك في الخامسة',
        conversationType: 'DIRECT',
      });

      expect(out).toEqual({
        title: 'رسالة جديدة',
        body: 'علي أحمد: أراك في الخامسة',
      });
    });

    it('TEAM renders its own wording in both languages', () => {
      expect(
        renderNotification('chat.message', 'en', {
          ...base,
          conversationType: 'TEAM',
        }).title,
      ).toBe('New messages in the team chat');

      expect(
        renderNotification('chat.message', 'ar', {
          ...base,
          conversationType: 'TEAM',
        }).title,
      ).toBe('رسائل جديدة في دردشة الفريق');
    });

    it('without a snippet it falls back to a content-free sentence', () => {
      expect(
        renderNotification('chat.message', 'en', {
          actorName: 'Alice',
          conversationType: 'DIRECT',
        }).body,
      ).toBe('Alice sent you a message.');

      expect(
        renderNotification('chat.message', 'ar', {
          actorName: 'علي',
          conversationType: 'TEAM',
        }).body,
      ).toBe('كتب علي في دردشة الفريق.');
    });

    it('a missing actor uses the generic label', () => {
      expect(
        renderNotification('chat.message', 'en', {
          snippet: 'hi',
          conversationType: 'DIRECT',
        }).body,
      ).toBe('Someone: hi');
    });

    it('an unknown language falls back to English', () => {
      expect(
        renderNotification('chat.message', 'fr', {
          ...base,
          conversationType: 'DIRECT',
        }).title,
      ).toBe('New message');
    });

    it('user text is inserted verbatim: "()", "$&" and "{title}" are not interpreted', () => {
      const out = renderNotification('chat.message', 'en', {
        actorName: 'A',
        snippet: 'call me () $& {title} {when} to .',
        conversationType: 'DIRECT',
      });

      expect(out.body).toBe('A: call me () $& {title} {when} to .');
    });

    it('re-sanitises a poisoned stored snippet when rendering', () => {
      const out = renderNotification('chat.message', 'en', {
        actorName: 'A',
        snippet: `x‮${'y'.repeat(500)}`,
        conversationType: 'DIRECT',
      });

      expect(out.body).not.toMatch(/‮/);
      expect(Array.from(out.body.slice(3))).toHaveLength(80);
    });
  });

  describe('push and email never carry message text', () => {
    const context = {
      actorName: 'Alice',
      snippet: 'TOP SECRET CONTENT',
      conversationType: 'DIRECT',
    };

    it('renderPushPayload drops the snippet even if the caller passes it', () => {
      const payload = renderPushPayload(
        'chat.message',
        'en',
        context,
        '/dashboard/chat?c=abc',
        'n1',
        'abc',
      );

      expect(JSON.stringify(payload)).not.toContain('TOP SECRET');
      expect(payload.body).toBe('Alice sent you a message.');
      expect(payload.path).toBe('/dashboard/chat?c=abc');
    });

    it('uses one tag per conversation so pushes replace instead of stacking', () => {
      const a = renderPushPayload(
        'chat.message',
        'en',
        context,
        null,
        'n1',
        'abc',
      );
      const b = renderPushPayload(
        'chat.message',
        'en',
        context,
        null,
        'n2',
        'abc',
      );
      const other = renderPushPayload(
        'chat.message',
        'en',
        context,
        null,
        'n3',
        'zzz',
      );

      expect(a.tag).toBe('chat-abc');
      expect(b.tag).toBe(a.tag);
      expect(other.tag).toBe('chat-zzz');
    });

    it('falls back to the per-notification tag for an unsafe or missing entity id', () => {
      expect(
        renderPushPayload('chat.message', 'en', context, null, 'n1', 'a b').tag,
      ).toBe('notification-n1');
      expect(
        renderPushPayload('chat.message', 'en', context, null, 'n1').tag,
      ).toBe('notification-n1');
    });

    it('other types keep their per-notification tag', () => {
      expect(
        renderPushPayload(
          'task.assigned',
          'en',
          { title: 'T' },
          null,
          'n9',
          'x',
        ).tag,
      ).toBe('notification-n9');
    });

    it('the email renderer (if ever asked) is not given a snippet by the worker contract', () => {
      // The worker builds its render context from params.title/startAt only.
      const email = renderNotificationEmail(
        'chat.message',
        'en',
        { actorName: 'Alice', conversationType: 'DIRECT' },
        null,
      );

      expect(email.html).not.toContain('TOP SECRET');
      expect(email.text).toContain('Alice sent you a message.');
    });
  });

  describe('buildNotificationPath (chat_conversation)', () => {
    it('opens the conversation through the chat page ?c= parameter', () => {
      expect(buildNotificationPath('chat_conversation', 'clx123_AB-9')).toBe(
        '/dashboard/chat?c=clx123_AB-9',
      );
    });

    it('never embeds an unsafe id: it falls back to the chat page', () => {
      for (const bad of ['a b', 'a/b', '../x', 'a?b=1', 'x'.repeat(65), '']) {
        expect(buildNotificationPath('chat_conversation', bad)).toBe(
          '/dashboard/chat',
        );
      }
      expect(buildNotificationPath('chat_conversation', null)).toBe(
        '/dashboard/chat',
      );
    });

    it('every chat path is an in-app /dashboard path with no scheme', () => {
      const path = buildNotificationPath('chat_conversation', 'abc')!;
      expect(path.startsWith('/dashboard/chat')).toBe(true);
      expect(path).not.toMatch(/:|\\|\/\//);
    });

    it('existing entity types are unchanged', () => {
      expect(buildNotificationPath('task', 'x')).toBe('/dashboard/tasks');
      expect(buildNotificationPath('deal', 'd1')).toBe('/dashboard/deals/d1');
      expect(buildNotificationPath('lead', 'l1')).toBe('/dashboard/leads/l1');
      expect(buildNotificationPath('calendar_event', 'c1')).toBe(
        '/dashboard/calendar',
      );
      expect(buildNotificationPath('unknown', 'x')).toBeNull();
    });
  });

  describe('regression: other notification types render exactly as before', () => {
    it('task.assigned', () => {
      expect(
        renderNotification('task.assigned', 'en', {
          actorName: 'Bob',
          title: 'Write report',
        }),
      ).toEqual({
        title: 'New task assigned to you',
        body: 'Bob assigned you the task "Write report".',
      });
    });

    it('calendar.cancelled without a date still drops the empty "()"', () => {
      expect(
        renderNotification('calendar.cancelled', 'en', {
          actorName: 'Bob',
          title: 'Sync',
        }).body,
      ).toBe('Bob cancelled the event "Sync".');
    });
  });
});
