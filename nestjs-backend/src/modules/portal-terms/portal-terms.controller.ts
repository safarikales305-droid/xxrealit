import { Controller, Get, NotFoundException } from '@nestjs/common';
import { PortalTermsService } from './portal-terms.service';

@Controller('portal-terms')
export class PortalTermsController {
  constructor(private readonly terms: PortalTermsService) {}

  @Get('current')
  async getCurrent() {
    const current = await this.terms.getCurrentPublished();
    if (!current) {
      throw new NotFoundException('Obchodní podmínky nejsou publikovány');
    }
    return current;
  }
}
