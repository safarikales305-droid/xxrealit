import { Controller, Get } from '@nestjs/common';
import { OPortaluService } from './o-portalu.service';

@Controller('public/o-portalu')
export class OPortaluPublicController {
  constructor(private readonly oPortalu: OPortaluService) {}

  @Get()
  getPublic() {
    return this.oPortalu.getPublicPayload();
  }
}
