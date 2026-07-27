import { buildSeoAiPageFromAi } from './seo-ai-page.builder';

const contentOnlyResponse = {
  title: 'Byty na prodej Pardubice',
  metaTitle: 'Byty na prodej Pardubice – průvodce pro kupující',
  metaDescription:
    'Praktický průvodce prodejem bytů v Pardubicích. Tipy, lokální kontext a ověřené informace pro kupující i prodávající na portálu XXREALIT.',
  h1: 'Byty na prodej v Pardubicích',
  intro: 'Pardubice nabízejí kombinaci dostupného bydlení, služeb a dopravní dostupnosti.',
  mainContent: `Pardubice jsou regionálním centrem východních Čech.

Trh s byty se liší podle čtvrtí a stavu nemovitosti. Při koupi je vhodné ověřit technický stav, náklady a dostupnost služeb.`,
  faq: [{ question: 'Kde začít hledání?', answer: 'Projděte si tento průvodce a okolní lokality.' }],
};

const { output, log } = buildSeoAiPageFromAi(contentOnlyResponse, {
  locationName: 'Pardubice',
  offerLabel: 'Prodej bytu',
  hasListings: false,
  intentSlug: 'prodej-bytu',
});

if (output.blocks.length < 7) {
  throw new Error(`expected >=7 blocks, got ${output.blocks.length}`);
}
if (!output.metaTitle || !output.h1 || !output.faq.length) {
  throw new Error('missing required page fields after build');
}
if (!log.blocksAdded.length && output.blocks.length < 2) {
  throw new Error('builder should add blocks when AI sends content only');
}

const plainTextOnly = buildSeoAiPageFromAi(
  'Dlouhý článek o Pardubicích bez JSON struktury. '.repeat(30),
  { locationName: 'Pardubice', offerLabel: 'Prodej bytu', hasListings: false },
);
if (plainTextOnly.output.blocks.length < 7) {
  throw new Error(`plain text fallback expected >=7 blocks, got ${plainTextOnly.output.blocks.length}`);
}

console.log(
  'seo-ai-page builder tests OK',
  output.blocks.length,
  'blocks, added:',
  log.blocksAdded.map((b) => b.type).join(','),
);
