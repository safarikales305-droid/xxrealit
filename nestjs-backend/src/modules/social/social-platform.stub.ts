import { Injectable, ServiceUnavailableException } from '@nestjs/common';

const MSG =
  'Nahrání videa přes API zatím není nakonfigurováno. Použijte stažení videa a ruční nahrání na sociální síť.';

@Injectable()
export class SocialPlatformStubService {
  assertConfigured(platform: string): never {
    throw new ServiceUnavailableException(
      `Pro nahrání videa na ${platform} je nutné propojit účet ${platform}. ${MSG}`,
    );
  }

  connect(_platform: string) {
    return this.assertConfigured(_platform);
  }

  uploadVideo(_platform: string) {
    return this.assertConfigured(_platform);
  }
}
