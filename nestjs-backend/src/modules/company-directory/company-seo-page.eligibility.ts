export function isEligibleCompanyForSeoGeneration(company: {
  publicProfile: boolean;
  hidden: boolean;
  inLiquidation: boolean;
  inactive: boolean;
  dissolved: boolean;
}): boolean {
  return (
    company.publicProfile &&
    !company.hidden &&
    !company.inLiquidation &&
    !company.inactive &&
    !company.dissolved
  );
}
