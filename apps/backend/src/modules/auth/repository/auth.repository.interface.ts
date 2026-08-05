import { IAuthUser } from '../interfaces/auth-user.interface';

export interface IAuthRepository {
  findUserForLogin(email: string): Promise<IAuthUser | null>;
}
