import { Module } from '@nestjs/common';

import { UserController } from './user.controller';
import { UserService } from './user.service';
import { UserRepository } from './repository/user.repository';
import { PasswordService } from './services/password.service';
import { USER_REPOSITORY } from './constants/user.constants';

@Module({
  controllers: [UserController],

  providers: [
    UserService,
    PasswordService,

    {
      provide: USER_REPOSITORY,
      useClass: UserRepository,
    },
  ],

  exports: [UserService, PasswordService, USER_REPOSITORY],
})
export class UserModule {}
