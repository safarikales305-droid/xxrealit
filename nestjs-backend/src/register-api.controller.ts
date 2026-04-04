import { Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { PrismaService } from './database/prisma.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bcrypt = require('bcrypt');

/**
 * Express-style registrace na POST /api/register (globální prefix „api“).
 */
@Controller()
export class RegisterApiController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('register')
  async register(
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    try {
      console.log('BODY:', req.body);

      const { email, password, name, role } = req.body;

      const hashedPassword = await bcrypt.hash(password, 10);

      const mappedRole: UserRole =
        role === 'Soukromý inzerent'
          ? UserRole.USER
          : role === 'Realitní kancelář'
            ? UserRole.AGENT
            : UserRole.USER;

      const user = await this.prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          role: mappedRole,
        },
      });

      res.status(201).json(user);
    } catch (err: any) {
      console.error('❌ REGISTER ERROR:', err);

      res.status(500).send({
        error: err?.message,
        stack: err?.stack,
      });
    }
  }
}
