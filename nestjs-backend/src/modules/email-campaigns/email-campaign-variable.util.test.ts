import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderCampaignContent, splitFirstName } from './email-campaign-variable.util';

test('splitFirstName extracts first token', () => {
  assert.equal(splitFirstName('Jan Novák'), 'Jan');
  assert.equal(splitFirstName(''), '');
});

test('renderCampaignContent replaces variables', () => {
  const out = renderCampaignContent('Ahoj {{firstName}}, e-mail {{email}}', {
    firstName: 'Petr',
    email: 'petr@test.cz',
  });
  assert.equal(out, 'Ahoj Petr, e-mail petr@test.cz');
});
