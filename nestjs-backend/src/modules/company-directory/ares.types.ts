export type AresAddress = {
  kodStatu?: string;
  nazevStatu?: string;
  kodKraje?: number;
  nazevKraje?: string;
  kodOkresu?: number;
  nazevOkresu?: string;
  kodObce?: number;
  nazevObce?: string;
  nazevUlice?: string;
  cisloDomovni?: number;
  cisloOrientacni?: number;
  psc?: number;
  textovaAdresa?: string;
};

export type AresRegistrationStatus = {
  stavZdrojeRos?: string;
  stavZdrojeVr?: string;
  stavZdrojeRes?: string;
  stavZdrojeRzp?: string;
  stavZdrojeDph?: string;
};

export type AresEconomicSubject = {
  ico: string;
  obchodniJmeno: string;
  sidlo?: AresAddress;
  pravniForma?: string;
  pravniFormaRos?: string;
  financniUrad?: string;
  datumVzniku?: string;
  datumAktualizace?: string;
  dic?: string;
  czNace?: string[];
  czNace2008?: string[];
  seznamRegistraci?: AresRegistrationStatus;
  primarniZdroj?: string;
};

export type AresSearchResponse = {
  pocetCelkem?: number;
  ekonomickeSubjekty?: AresEconomicSubject[];
  kod?: string;
  popis?: string;
  subKod?: string;
};

export type AresSearchFilter = {
  start?: number;
  pocet?: number;
  ico?: string[];
  obchodniJmeno?: string;
  sidlo?: {
    textovaAdresa?: string;
    kodObce?: number;
    nazevObce?: string;
    kodKraje?: number;
    kodOkresu?: number;
    nazevOkresu?: string;
  };
  czNace?: string[];
  pravniForma?: string[];
};

export type AresApiError = {
  kod?: string;
  popis?: string;
  subKod?: string;
};
