import { IsNotEmpty, IsString, IsUrl, MaxLength } from 'class-validator';

export class FacebookUploadVideoDto {
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  videoUrl!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description!: string;

  @IsUrl({ require_protocol: true })
  listingUrl!: string;
}
