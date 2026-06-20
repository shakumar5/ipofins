import { smartMoneyTabPath, type SmartMoneyTab } from '../../lib/smart-money-meta';
import { STOCK_SIGNAL_BASE } from '../../lib/stock-signal-meta';

type ActiveTab = SmartMoneyTab | 'stock-signal-hub';

interface Props {
  active: ActiveTab;
}

const TABS: { id: ActiveTab; label: string; href: string }[] = [
  { id: 'tracker', label: 'Smart Money Tracker', href: smartMoneyTabPath('tracker') },
  { id: 'signals', label: 'Smart Money Signal', href: smartMoneyTabPath('signals') },
  { id: 'stock-signal-hub', label: 'Stock Signal', href: STOCK_SIGNAL_BASE },
  { id: 'sectors', label: 'Sector Intelligence', href: smartMoneyTabPath('sectors') },
];

export default function SmartMoneySubNav({ active }: Props) {
  const tabClass = (isActive: boolean) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      isActive
        ? 'bg-primary-600 text-white'
        : 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-700'
    }`;

  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {TABS.map((tab) => (
        <a key={tab.id} href={tab.href} className={tabClass(active === tab.id)}>
          {tab.label}
        </a>
      ))}
    </div>
  );
}
