import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { serializeProperty } from '../properties/properties.serializer';
import {
  mapRapidResponseToRows,
  RAPID_REALTY_HOST,
  RAPID_REALTY_LIST_URL,
} from './rapid-realty-import';
import { parseStringPromise } from 'xml2js';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bcrypt = require('bcrypt');

type XmlPropertyRow = {
  title: string;
  price: number;
  city: string;
  description: string;
  image: string | null;
};

function toFlatString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const s = toFlatString(item);
      if (s) return s;
    }
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj._ === 'string') return obj._.trim();
  }
  return '';
}

function pickByKeys(obj: unknown, keys: string[]): string {
  if (!obj || typeof obj !== 'object') return '';
  const source = obj as Record<string, unknown>;
  for (const key of keys) {
    if (key in source) {
      const s = toFlatString(source[key]);
      if (s) return s;
    }
  }
  return '';
}

function collectXmlPropertyNodes(node: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (value: unknown) => {
    if (!value) return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (typeof value !== 'object') return;
    const obj = value as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      const key = k.toLowerCase();
      if (
        key === 'property' ||
        key === 'properties' ||
        key === 'offer' ||
        key === 'offers' ||
        key === 'listing' ||
        key === 'listings' ||
        key === 'item' ||
        key === 'items'
      ) {
        if (Array.isArray(v)) {
          for (const item of v) {
            if (item && typeof item === 'object') {
              out.push(item as Record<string, unknown>);
            }
          }
        } else if (v && typeof v === 'object') {
          out.push(v as Record<string, unknown>);
        }
      }
      walk(v);
    }
  };
  walk(node);
  return out;
}

function mapXmlNodeToRow(node: Record<string, unknown>): XmlPropertyRow {
  const title =
    pickByKeys(node, ['title', 'name', 'headline']) || 'Importovaný inzerát';
  const rawPrice = pickByKeys(node, ['price', 'amount', 'cost']);
  const priceDigits = rawPrice.replace(/[^\d]/g, '');
  const parsedPrice = Number.parseInt(priceDigits || '0', 10);
  const city = pickByKeys(node, ['city', 'town', 'locality']) || 'Neznámé město';
  const description =
    pickByKeys(node, ['description', 'desc', 'text']) || title;
  const image = pickByKeys(node, ['image', 'img', 'photo', 'picture']) || '';
  return {
    title: title.slice(0, 250),
    price: Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : 1,
    city: city.slice(0, 120),
    description: description.slice(0, 10_000),
    image: image || null,
  };
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async stats() {
    const [totalUsers, adminUsers, properties, pendingProperties, visits] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: UserRole.ADMIN } }),
      this.prisma.property.count(),
      this.prisma.property.count({
        where: { OR: [{ approved: false }, { status: 'PENDING' }] },
      }),
      this.prisma.visit.count(),
    ]);
    return {
      users: totalUsers - adminUsers,
      admins: adminUsers,
      total: totalUsers,
      properties,
      pendingProperties,
      visits,
    };
  }

  async listAllProperties() {
    const rows = await this.prisma.property.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, city: true } },
        _count: { select: { likes: true } },
      },
    });
    return rows.map((r) =>
      serializeProperty(
        {
          ...r,
          likes: [],
          _count: r._count,
          user: { id: r.user.id, city: r.user.city },
        },
        undefined,
      ),
    );
  }

  async listPendingProperties() {
    const rows = await this.prisma.property.findMany({
      where: {
        OR: [{ approved: false }, { status: 'PENDING' }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, city: true } },
        _count: { select: { likes: true } },
      },
    });
    return rows.map((r) =>
      serializeProperty(
        {
          ...r,
          likes: [],
          _count: r._count,
          user: { id: r.user.id, city: r.user.city },
        },
        undefined,
      ),
    );
  }

  async listUsers() {
    const rows = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        avatar: true,
        createdAt: true,
        name: true,
      },
    });
    return rows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      avatarUrl: u.avatar,
      createdAt: u.createdAt,
    }));
  }

  async approveProperty(propertyId: string) {
    const p = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!p) {
      throw new NotFoundException('Inzerát nenalezen');
    }
    return this.prisma.property.update({
      where: { id: propertyId },
      data: { approved: true, status: 'APPROVED' },
    });
  }

  async deleteProperty(propertyId: string) {
    const p = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!p) {
      throw new NotFoundException('Inzerát nenalezen');
    }
    await this.prisma.property.delete({ where: { id: propertyId } });
    return { success: true };
  }

  /**
   * RapidAPI Realty in US — import pod účtem volajícího admina (approved = true).
   */
  async importPropertiesFromRapidApi(adminUserId: string, apiKeyRaw: string) {
    const apiKey = typeof apiKeyRaw === 'string' ? apiKeyRaw.trim() : '';
    if (!apiKey) {
      throw new BadRequestException('apiKey je povinný');
    }

    const url = new URL(RAPID_REALTY_LIST_URL);
    url.searchParams.set('limit', '20');
    url.searchParams.set('city', 'Houston');
    url.searchParams.set('state_code', 'TX');

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        headers: {
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': RAPID_REALTY_HOST,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(45_000),
      });
    } catch {
      throw new BadRequestException('Nepodařilo se spojit s RapidAPI');
    }

    if (res.status === 401 || res.status === 403) {
      throw new UnauthorizedException('Neplatný nebo nepovolený RapidAPI klíč');
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new BadRequestException(
        `RapidAPI vrátilo HTTP ${res.status}${text ? `: ${text.slice(0, 240)}` : ''}`,
      );
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new BadRequestException('RapidAPI nevrátilo platné JSON');
    }

    const rows = mapRapidResponseToRows(json);
    if (rows.length === 0) {
      throw new BadRequestException(
        'API nevrátilo žádné zpracovatelné inzeráty. Zkontrolujte klíč nebo strukturu odpovědi.',
      );
    }

    const maxPerRun = 50;
    const slice = rows.slice(0, maxPerRun);
    let imported = 0;
    for (const row of slice) {
      await this.prisma.property.create({
        data: {
          title: row.title,
          description: row.description ?? row.title,
          price: row.price,
          city: row.city,
          address: row.city,
          currency: 'USD',
          offerType: 'prodej',
          propertyType: 'import',
          subType: '',
          images: row.imageUrl ? [row.imageUrl] : [],
          videoUrl: null,
          contactName: 'RapidAPI import',
          contactPhone: '+000',
          contactEmail: 'import@example.com',
          userId: adminUserId,
          approved: true,
          status: 'APPROVED',
        },
      });
      imported += 1;
    }

    return { imported };
  }

  async importPropertiesFromXml(adminUserId: string, xmlUrlRaw: string) {
    const xmlUrl = typeof xmlUrlRaw === 'string' ? xmlUrlRaw.trim() : '';
    if (!xmlUrl) {
      throw new BadRequestException('url je povinná');
    }
    if (!/^https?:\/\//i.test(xmlUrl)) {
      throw new BadRequestException('url musí začínat http:// nebo https://');
    }

    let res: Response;
    try {
      res = await fetch(xmlUrl, {
        headers: { Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8' },
        signal: AbortSignal.timeout(45_000),
      });
    } catch {
      throw new BadRequestException('Nepodařilo se stáhnout XML feed');
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new BadRequestException(
        `XML feed vrátil HTTP ${res.status}${text ? `: ${text.slice(0, 240)}` : ''}`,
      );
    }

    const xmlText = await res.text();
    let parsed: unknown;
    try {
      parsed = await parseStringPromise(xmlText, {
        explicitArray: false,
        trim: true,
        mergeAttrs: true,
      });
    } catch {
      throw new BadRequestException('Nepodařilo se parsovat XML (xml2js)');
    }

    const nodes = collectXmlPropertyNodes(parsed);
    if (nodes.length === 0) {
      throw new BadRequestException('V XML nebyly nalezeny žádné nemovitosti');
    }

    const maxPerRun = 200;
    const rows = nodes.slice(0, maxPerRun).map(mapXmlNodeToRow);

    let imported = 0;
    for (const row of rows) {
      await this.prisma.property.create({
        data: {
          title: row.title,
          description: row.description,
          price: row.price,
          city: row.city,
          address: row.city,
          currency: 'CZK',
          offerType: 'prodej',
          propertyType: 'import',
          subType: '',
          images: row.image ? [row.image] : [],
          videoUrl: null,
          contactName: 'XML import',
          contactPhone: '+000',
          contactEmail: 'import@example.com',
          userId: adminUserId,
          approved: true,
          status: 'APPROVED',
        },
      });
      imported += 1;
    }

    return { imported };
  }

  async updateUserRole(_actorId: string, targetId: string, newRole: UserRole) {
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) {
      throw new NotFoundException('Uživatel nenalezen');
    }
    if (target.role === UserRole.ADMIN && newRole !== UserRole.ADMIN) {
      const adminCount = await this.prisma.user.count({
        where: { role: UserRole.ADMIN },
      });
      if (adminCount <= 1) {
        throw new BadRequestException('Nelze odebrat posledního administrátora');
      }
    }
    const updated = await this.prisma.user.update({
      where: { id: targetId },
      data: { role: newRole },
      select: {
        id: true,
        email: true,
        role: true,
        avatar: true,
        createdAt: true,
        name: true,
      },
    });
    return {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
      avatarUrl: updated.avatar,
      createdAt: updated.createdAt,
    };
  }

  async deleteUser(actorId: string, targetId: string) {
    if (actorId === targetId) {
      throw new BadRequestException('Nelze smazat vlastní účet');
    }
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) {
      throw new NotFoundException('Uživatel nenalezen');
    }
    if (target.role === UserRole.ADMIN) {
      const adminCount = await this.prisma.user.count({
        where: { role: UserRole.ADMIN },
      });
      if (adminCount <= 1) {
        throw new BadRequestException('Nelze smazat posledního administrátora');
      }
    }
    await this.prisma.user.delete({ where: { id: targetId } });
    return { success: true };
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('Nové heslo musí mít alespoň 8 znaků');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });
    if (!user) {
      throw new NotFoundException();
    }
    const ok = await bcrypt.compare(oldPassword, user.password);
    if (!ok) {
      throw new UnauthorizedException('Současné heslo je nesprávné');
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hash },
    });
    return { success: true };
  }
}
