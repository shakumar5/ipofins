import type { PageMeta } from './page-meta';

export type IpoPerformanceFilter = 'all' | 'mainboard' | 'sme';

export function getIpoPerformancePageMeta(
  year: string,
  filter: IpoPerformanceFilter,
  counts: { all: number; mainboard: number; sme: number },
): PageMeta {
  const basePath = `/ipo/performance/${year}`;
  const path =
    filter === 'all' ? basePath : `${basePath}?type=${filter}`;

  if (filter === 'mainboard') {
    return {
      title: `Mainboard IPO Performance ${year} - Listing Returns | IPOFins`,
      description: `${counts.mainboard} mainboard IPOs listed in ${year}. Track listing day returns, sort by gains, and compare issue vs listing price.`,
      path,
      heading: `Mainboard IPO Performance ${year}`,
      subtitle: `Listing day returns for mainboard IPOs in ${year}. Click any company for details.`,
      breadcrumbLabel: `IPO Performance ${year}`,
    };
  }

  if (filter === 'sme') {
    return {
      title: `SME IPO Performance ${year} - Listing Returns | IPOFins`,
      description: `${counts.sme} SME IPOs listed in ${year} on BSE SME and NSE Emerge. Track listing gains and compare issue vs listing price.`,
      path,
      heading: `SME IPO Performance ${year}`,
      subtitle: `Listing day returns for SME IPOs in ${year}. Click any company for details.`,
      breadcrumbLabel: `IPO Performance ${year}`,
    };
  }

  return {
    title: `IPO Performance ${year} - Listing Returns | IPOFins`,
    description: `IPO performance ${year}: ${counts.mainboard} mainboard + ${counts.sme} SME IPOs. Track listing gains, sort by returns, view company details.`,
    path: basePath,
    heading: `IPO Performance ${year}`,
    subtitle: `Listing day returns for all IPOs in ${year}. Click any company for details.`,
    breadcrumbLabel: `IPO Performance ${year}`,
  };
}

export function ipoFilterFromSearch(search: string): IpoPerformanceFilter {
  const type = new URLSearchParams(search).get('type');
  if (type === 'mainboard' || type === 'sme') return type;
  return 'all';
}
