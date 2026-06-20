import { Controller, Get } from '@nestjs/common';
import { PostSoundsService } from './post-sounds.service';

@Controller('post-sounds')
export class PostSoundsController {
  constructor(private readonly postSounds: PostSoundsService) {}

  @Get()
  listActive() {
    return this.postSounds.listActiveForPicker();
  }
}
