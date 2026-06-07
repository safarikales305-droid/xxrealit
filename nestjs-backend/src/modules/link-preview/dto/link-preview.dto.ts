import { IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class LinkPreviewDto {
  @IsString()
  @MinLength(8)
  @MaxLength(2048)
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  url!: string;
}
