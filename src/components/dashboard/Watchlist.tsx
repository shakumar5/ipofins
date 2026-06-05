import { useState } from 'react';

interface WatchlistItem {
  id: string;
  name: string;
  type: 'ipo' | 'fund' | 'stock';
  status: string;
  metric: string;
  metricValue: string;
  alert?: string;
}

const SAMPLE_WATCHLIST: WatchlistItem[] = [
  { id: '1', name: 'Hexagon Nutrition IPO', type: 'ipo', status: 'Live', metric: 'GMP', metricValue: '+₹45', alert: 'Subscription at 3.2x' },
  { id: '2', name: 'CMR Green Technologies IPO', type: 'ipo', status: 'Live', metric: 'GMP', metricValue: '+₹72', alert: 'Closing today!' },
  { id: '3', name: 'Quant Small Cap Fund', type: 'fund', status: 'Active', metric: '1Y Return', metricValue: '+28.2%' },
  { id: '4', name: 'PPFAS Flexi Cap Fund', type: 'fund', status: 'Active', metric: 'NAV', metricValue: '₹72.45' },
  { id: '5', name: 'Upcoming: DataMatrix AI IPO', type: 'ipo', status: 'Filed', metric: 'Issue Size', metricValue: '₹500 Cr', alert: 'DRHP Filed - Expected Jun 2026' },
];

interface AlertConfig {
  id: string;
  label: string;
  enabled: boolean;
  description: string;
}

const SAMPLE_ALERTS: AlertConfig[] = [
  { id: '1', label: 'New IPO Opens', enabled: true, description: 'Get notified when a new IPO opens for subscription' },
  { id: '2', label: 'GMP Changes', enabled: true, description: 'Alert when GMP moves more than ₹20' },
  { id: '3', label: 'Allotment Status', enabled: true, description: 'Notify when IPO allotment status is available' },
  { id: '4', label: 'High AI Score IPOs', enabled: false, description: 'Alert for IPOs with AI score 7+' },
  { id: '5', label: 'Fund NAV Alerts', enabled: false, description: 'Daily NAV update for watchlisted funds' },
  { id: '6', label: 'Market News', enabled: false, description: 'Important market news and SEBI updates' },
];

export default function Watchlist() {
  const [watchlist] = useState<WatchlistItem[]>(SAMPLE_WATCHLIST);
  const [alerts, setAlerts] = useState<AlertConfig[]>(SAMPLE_ALERTS);
  const [activeTab, setActiveTab] = useState<'watchlist' | 'alerts'>('watchlist');

  const toggleAlert = (id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a));
  };

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
        <button
          onClick={() => setActiveTab('watchlist')}
          className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'watchlist' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500'
          }`}
        >
          Watchlist ({watchlist.length})
        </button>
        <button
          onClick={() => setActiveTab('alerts')}
          className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'alerts' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500'
          }`}
        >
          Alerts
        </button>
      </div>

      {/* Watchlist */}
      {activeTab === 'watchlist' && (
        <div className="space-y-3">
          {watchlist.map(item => (
            <div key={item.id} className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{item.name}</h4>
                    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                      item.status === 'Live' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                      item.status === 'Filed' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                      'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                    }`}>
                      {item.status}
                    </span>
                  </div>
                  {item.alert && (
                    <p className="text-xs text-orange-500 dark:text-orange-400 mt-1 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      {item.alert}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{item.metric}</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{item.metricValue}</p>
                </div>
              </div>
            </div>
          ))}

          <button className="w-full p-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors">
            + Add to Watchlist
          </button>
        </div>
      )}

      {/* Alerts */}
      {activeTab === 'alerts' && (
        <div className="space-y-3">
          {alerts.map(alert => (
            <div key={alert.id} className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{alert.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{alert.description}</p>
              </div>
              <button
                onClick={() => toggleAlert(alert.id)}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  alert.enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  alert.enabled ? 'translate-x-5' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
