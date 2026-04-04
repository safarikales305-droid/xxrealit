import { Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { PrismaService } from './database/prisma.service';

/**
 * Express-style přihlášení na POST /api/login (globální prefix „api“).
 */
@Controller()
export class LoginApiController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('login')
  async login(
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    try {
      console.log('LOGIN START');

      const { email, password } = req.body ?? {};

      const normalizedEmail =
        typeof email === 'string' ? email.trim().toLowerCase() : '';

      if (!normalizedEmail || typeof password !== 'string') {
        res.status(400).json({ error: 'Email a heslo jsou povinné' });
        return;
      }

      const user = await this.prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (!user) {
        res.status(401).json({
          error: 'Neplatný e-mail nebo heslo',
        });
        return;
      }

      const isValid = await bcrypt.compare(password, user.password);

      console.log('COMPARE RESULT:', isValid);

      if (!isValid) {
        res.status(401).json({
          error: 'Neplatný e-mail nebo heslo',
        });
        return;
      }

      res.json({
        id: user.id,
        email: user.email,
        role: user.role,
      });
    } catch (err: any) {
      console.error('LOGIN ERROR FULL:', err);

      res.status(500).json({
        error: err?.message,
      });
    }
  }
}
