import { CompanyApprovedEmailService } from './company-approved-email.service';

describe('CompanyApprovedEmailService', () => {
  const prisma = {
    companyDirectoryEntry: { findUnique: jest.fn(), update: jest.fn() },
    companyContact: { findMany: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
    companyReview: { findFirst: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    companyAuditLog: { findFirst: jest.fn() },
  };
  const audit = { log: jest.fn() };
  const companyEmail = {
    notifyCompanyNewReview: jest.fn(),
    resolveCompanyNotificationEmail: jest.fn(),
  };

  let service: CompanyApprovedEmailService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CompanyApprovedEmailService(
      prisma as never,
      audit as never,
      companyEmail as never,
    );
  });

  it('validates email format', () => {
    expect(() => service.validateBusinessEmail('not-an-email')).toThrow();
    expect(service.validateBusinessEmail('  Info@Firma.CZ ')).toBe('info@firma.cz');
  });

  it('does not overwrite existing verified email without forcePrimary', async () => {
    prisma.companyDirectoryEntry.findUnique.mockResolvedValue({
      id: 'c1',
      verifiedBusinessEmail: 'existing@firma.cz',
      email: 'existing@firma.cz',
      emailDiscoveredAt: null,
      discoveredEmail: null,
    });
    prisma.companyContact.findMany.mockResolvedValue([]);
    prisma.companyContact.create.mockResolvedValue({ id: 'ct1' });
    prisma.companyReview.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.attachAdminApprovedEmail({
      companyId: 'c1',
      email: 'new@firma.cz',
      adminUserId: 'admin1',
    });

    expect(result.verifiedEmailSet).toBe(false);
    expect(prisma.companyDirectoryEntry.update).not.toHaveBeenCalled();
    expect(prisma.companyContact.create).toHaveBeenCalled();
  });
});
