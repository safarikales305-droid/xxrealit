import { buildYouTubeReelDescription, buildYouTubeReelTitle } from './youtube-publish-metadata.util';

describe('youtube-publish-metadata', () => {
  it('builds engaging title instead of generic intro', () => {
    const title = buildYouTubeReelTitle({
      title: 'Co je nového ve světě realit',
      segments: [
        { title: 'Ceny bytů v Praze rostou' },
        { title: 'Nová regulace nájmů' },
        { title: 'Hypotéky levnější' },
      ],
    });
    expect(title.toLowerCase()).not.toBe('co je nového ve světě realit');
    expect(title).toContain('novinek');
  });

  it('includes xxrealit shorts link in description', () => {
    const desc = buildYouTubeReelDescription({
      title: 'Test',
      shortsCollectionId: 'col123',
      segments: [{ title: 'Segment A' }],
    });
    expect(desc).toContain('xxrealit.cz/?tab=shorts&collection=col123');
    expect(desc).toContain('#xxrealit');
  });
});
