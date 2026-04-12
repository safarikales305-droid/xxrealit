import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminService } from './admin.service';
import { AdminUpdatePropertyDto } from './dto/admin-update-property.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { AdminGuard } from './guards/admin.guard';

type ChangePasswordBody = {
  oldPassword?: string;
  newPassword?: string;
};

type ImportPropertiesBody = {
  apiKey?: string;
};

type ImportXmlBody = {
  url?: string;
};

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  getAdmin() {
    return { message: 'Admin panel OK' };
  }

  @Get('stats')
  stats() {
    return this.adminService.stats();
  }

  @Get('properties')
  listProperties() {
    return this.adminService.listAllProperties();
  }

  @Get('properties/pending')
  listPendingProperties() {
    return this.adminService.listPendingProperties();
  }

  @Get('listings')
  listListings(
    @Query('search') search?: string,
    @Query('listingType') listingType?: string,
    @Query('status') status?: string,
    @Query('userId') userId?: string,
    @Query('city') city?: string,
    @Query('createdFrom') createdFrom?: string,
    @Query('createdTo') createdTo?: string,
  ) {
    return this.adminService.listListings({
      search,
      listingType,
      status,
      userId,
      city,
      createdFrom,
      createdTo,
    });
  }

  @Patch('properties/:id/approve')
  approve(@Param('id') id: string) {
    return this.adminService.approveProperty(id);
  }

  @Patch('properties/:id')
  updateProperty(
    @Param('id') id: string,
    @Body() dto: AdminUpdatePropertyDto,
  ) {
    return this.adminService.updateProperty(id, dto);
  }

  @Delete('properties/:id')
  deleteProperty(@Param('id') id: string) {
    return this.adminService.deleteProperty(id);
  }

  @Get('users')
  listUsers() {
    return this.adminService.listUsers();
  }

  @Patch('users/:id/role')
  updateUserRole(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    return this.adminService.updateUserRole(user.id, id, dto.role);
  }

  @Delete('users/:id')
  deleteUser(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.adminService.deleteUser(user.id, id);
  }

  @Post('import-properties')
  importProperties(
    @CurrentUser() user: AuthUser,
    @Body() body: ImportPropertiesBody,
  ) {
    return this.adminService.importPropertiesFromRapidApi(
      user.id,
      typeof body.apiKey === 'string' ? body.apiKey : '',
    );
  }

  @Post('import-xml')
  importXml(
    @CurrentUser() user: AuthUser,
    @Body() body: ImportXmlBody,
  ) {
    return this.adminService.importPropertiesFromXml(
      user.id,
      typeof body.url === 'string' ? body.url : '',
    );
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
