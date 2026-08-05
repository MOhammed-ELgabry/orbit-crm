export class CreateEmailVerificationRepositoryDto {
  email: string;

  code: string;

  expiresAt: Date;
}
