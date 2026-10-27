import {
  buildAvatarRef,
  isLocalAvatarRef,
  localAvatarOrNull,
} from './avatar.constants';

describe('avatar references', () => {
  const checksum = 'a'.repeat(64);

  it('builds a versioned API path for the user', () => {
    expect(buildAvatarRef('cuid123', checksum)).toBe(
      '/users/cuid123/avatar?v=aaaaaaaaaaaaaaaa',
    );
  });

  it('changes when the picture changes', () => {
    expect(buildAvatarRef('u1', 'a'.repeat(64))).not.toBe(
      buildAvatarRef('u1', 'b'.repeat(64)),
    );
  });

  it('recognises only references to an uploaded picture', () => {
    expect(isLocalAvatarRef(buildAvatarRef('u1', checksum))).toBe(true);
    expect(isLocalAvatarRef('https://lh3.googleusercontent.com/a/x')).toBe(
      false,
    );
    expect(isLocalAvatarRef('//evil.example/users/u1/avatar?v=aaaaaaaa')).toBe(
      false,
    );
    expect(isLocalAvatarRef('/users/u1/avatar')).toBe(false);
    expect(isLocalAvatarRef('/users/../etc/avatar?v=aaaaaaaa')).toBe(false);
    expect(isLocalAvatarRef('')).toBe(false);
    expect(isLocalAvatarRef(null)).toBe(false);
    expect(isLocalAvatarRef(undefined)).toBe(false);
  });

  it('never passes an external URL on', () => {
    expect(localAvatarOrNull('https://graph.facebook.com/x.jpg')).toBeNull();
    expect(localAvatarOrNull(buildAvatarRef('u1', checksum))).toBe(
      buildAvatarRef('u1', checksum),
    );
  });
});
