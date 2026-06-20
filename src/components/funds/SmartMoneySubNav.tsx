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
  return (
    <nav className="nav-btn-group mb-6" aria-label="Smart Money sections">
      {TABS.map((tab) => (
        <a
          key={tab.id}
          href={tab.href}
          className={active === tab.id ? 'btn-primary px-6 py-3' : 'btn-secondary px-6 py-3'}
          aria-current={active === tab.id ? 'page' : undefined}
        >
          {tab.label}
        </a>
      ))}
    </nav>
  );
}
