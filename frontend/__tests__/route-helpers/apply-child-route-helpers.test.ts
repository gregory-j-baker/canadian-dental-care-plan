import { describe, expect, it } from 'vitest';

import { transformChildrenRouteAdobeAnalyticsUrl } from '~/route-helpers/apply-child-route-helpers';

describe('transformChildrenRouteAdobeAnalyticsUrl', () => {
  it.each([
    ['https://example.com/en/'],
    ['https://example.com/fr/'],
    ['https://example.com/en/status'],
    ['https://example.com/fr/statut'],
    ['https://example.com/en/apply/00000000-0000-0000-0000-000000000000/somepage/'],
    ['https://example.com/en/demander/00000000-0000-0000-0000-000000000000/somepage/'],
  ])('should return as is for %s when not matching the apply route regex', (url) => {
    const actual = transformChildrenRouteAdobeAnalyticsUrl(url);
    expect(actual).toEqual(new URL(url));
  });

  it.each([
    ['https://example.com/en/apply/00000000-0000-0000-0000-000000000000/child/children/00000000-0000-0000-0000-000000000000/somepage/', 'https://example.com/en/apply/child/children/somepage/'],
    ['https://example.com/fr/apply/00000000-0000-0000-0000-000000000000/child/children/00000000-0000-0000-0000-000000000000/somepage/', 'https://example.com/fr/apply/child/children/somepage/'],
    ['https://example.com/en/demander/00000000-0000-0000-0000-000000000000/enfant/enfants/00000000-0000-0000-0000-000000000000/somepage/', 'https://example.com/en/demander/enfant/enfants/somepage/'],
    ['https://example.com/fr/demander/00000000-0000-0000-0000-000000000000/enfant/enfants/00000000-0000-0000-0000-000000000000/somepage/', 'https://example.com/fr/demander/enfant/enfants/somepage/'],
  ])('should remove the session id path segment for %s when matching the apply route regex', (url, expectedUrl) => {
    const actual = transformChildrenRouteAdobeAnalyticsUrl(url);
    expect(actual).toEqual(new URL(expectedUrl));
  });
});
