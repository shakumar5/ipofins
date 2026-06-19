interface FundOverlapItem {
  slug: string;
  name: string;
}

interface Props {
  funds: FundOverlapItem[];
}

export default function FundOverlapTab({ funds }: Props) {
  if (funds.length === 0) {
    return (
      <p className="text-surface-500 py-12 text-center text-sm">
        Overlap data not available yet. Run the monthly holdings pipeline and compute overlaps.
      </p>
    );
  }

  return (
    <div>
      <p className="text-sm text-surface-500 mb-4">
        {funds.length} funds with holdings — select one to see overlap with other schemes that also have holdings data.
        For 2–4 fund comparison use{' '}
        <a href="/mutual-funds/portfolio-overlap-checker" className="text-primary-600 hover:underline">
          Portfolio Overlap Checker
        </a>
        .
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {funds.map((fund) => (
          <a
            key={fund.slug}
            href={`/mutual-funds/fund-overlap/${fund.slug}`}
            className="card-compact block hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
          >
            <span className="text-sm font-medium text-surface-900 dark:text-white">{fund.name}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
