import {
  Body,
  Controller,
  Get,
  Patch,
  Param,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminService } from './admin.service';
import { AdminGuard } from './guards/admin.guard';

type ChangePasswordBody = {
  oldPassword?: string;
  newPassword?: string;
};

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  stats() {
    return this.adminService.stats();
  }

  @Get('properties')
  listProperties() {
    return this.adminService.listAllProperties();
  }

  @Patch('properties/:id/approve')
  approve(@Param('id') id: string) {
    return this.adminService.approveProperty(id);
  }

  @Get('users')
  listUsers() {
    return this.adminService.listUsers();
  }

  @Patch('password')
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() body: ChangePasswordBody,
  ) {
    const oldPassword =
      typeof body.oldPassword === 'string' ? body.oldPassword : '';
    const newPassword =
      typeof body.newPassword === 'string' ? body.newPassword : '';
    return this.adminService.changePassword(user.id, oldPassword, newPassword);
  }
}
