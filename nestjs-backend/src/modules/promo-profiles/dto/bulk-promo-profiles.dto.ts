import { ArrayNotEmpty, IsArray, IsIn, IsString } from 'class-validator';

export class BulkPromoProfilesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids!: string[];

  @IsIn(['publish', 'hide', 'deactivate', 'delete'])
  action!: 'publish' | 'hide' | 'deactivate' | 'delete';
}
