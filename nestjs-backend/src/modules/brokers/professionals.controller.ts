import { Controller, Get, Query } from '@nestjs/common';
import { BrokersService } from './brokers.service';

@Controller('professionals')
export class ProfessionalsController {
  constructor(private readonly brokersService: BrokersService) {}

  @Get('public')
  listPublic(@Query('roles') roles?: string) {
    return this.brokersService.listPublicProfessionals(roles);
  }
}
