import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { AdminGuard } from '../admin/guards/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateDeveloperNoteDto } from './dto/create-developer-note.dto';
import { UpdateDeveloperNoteDto } from './dto/update-developer-note.dto';
import { DeveloperNotesService } from './developer-notes.service';

@Controller('admin/developer-notes')
@UseGuards(JwtAuthGuard, AdminGuard)
export class DeveloperNotesAdminController {
  constructor(private readonly notes: DeveloperNotesService) {}

  @Get()
  list(
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
  ) {
    return this.notes.list({ q, category, status });
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: CreateDeveloperNoteDto,
  ) {
    return this.notes.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdateDeveloperNoteDto,
  ) {
    return this.notes.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.notes.remove(id);
  }
}
