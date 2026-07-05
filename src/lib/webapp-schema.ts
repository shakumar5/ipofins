const SITE = 'https://ipofins.com';

export interface WebAppSchemaOpts {
  name: string;
  slug: string;
  description: string;
}

/** WebApplication JSON-LD for finance tool pages. */
export function buildWebAppSchema({ name, slug, description }: WebAppSchemaOpts) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name,
    description,
    url: `${SITE}/tools/${slug}`,
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web Browser',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
    creator: { '@type': 'Organization', name: 'IPOFins', url: SITE },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
        { '@type': 'ListItem', position: 2, name: 'Tools', item: `${SITE}/tools` },
        { '@type': 'ListItem', position: 3, name, item: `${SITE}/tools/${slug}` },
      ],
    },
  };
}
