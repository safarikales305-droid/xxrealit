import { ArrayMaxSize, IsArray, IsString, IsUrl, MaxLength } from 'class-validator';

export class PrefillListingFromUrlDto {
  @IsString()
  @MaxLength(2000)
  @IsUrl({ require_protocol: true }, { message: 'Zadejte platnou URL včetně https://' })
  sourceUrl!: string;
}

export class FetchListingSourceImagesDto {
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  urls!: string[];
}
