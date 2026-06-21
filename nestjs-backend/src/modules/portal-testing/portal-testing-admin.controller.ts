import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateTestAccountDto } from './dto/create-test-account.dto';
import { UpdateTestAccountDto } from './dto/update-test-account.dto';
import { PortalTestingService } from './portal-testing.service';

@Controller('admin/portal-testing')
@UseGuards(JwtAuthGuard, AdminGuard)
export class PortalTestingAdminController {
  constructor(private readonly portalTesting: PortalTestingService) {}

  @Get()
  list() {
    return this.portalTesting.listTestAccounts();
  }

  @Post()
  create(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: CreateTestAccountDto,
  ) {
    return this.portalTesting.createTestAccount(dto);
  }

  @Patch(':userId')
  update(
    @Param('userId') userId: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdateTestAccountDto,
  ) {
    return this.portalTesting.updateTestAccount(userId, dto);
  }

  @Post(':userId/reset')
  reset(@Param('userId') userId: string) {
    return this.portalTesting.resetTestAccount(userId);
  }

  @Post(':userId/scenarios/:scenario')
  runScenario(@Param('userId') userId: string, @Param('scenario') scenario: string) {
    return this.portalTesting.runScenario(userId, scenario);
  }
}
