import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { SocialPlatformStubService } from '../social-platform.stub';

@Controller('social/instagram')
export class InstagramController {
  constructor(private readonly stub: SocialPlatformStubService) {}

  @Post('connect')
  @UseGuards(JwtAuthGuard)
  connect() {
    return this.stub.connect('Instagram');
  }

  @Post('upload-video')
  @UseGuards(JwtAuthGuard)
  uploadVideo(@Body() _body: Record<string, unknown>) {
    return this.stub.uploadVideo('Instagram');
  }
}
