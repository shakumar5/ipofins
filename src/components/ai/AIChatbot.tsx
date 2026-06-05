import { useState, useRef, useEffect } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const SAMPLE_RESPONSES: Record<string, string> = {
  'default': "I'm FinverseAI, your investment research assistant. I can help you with IPO analysis, mutual fund comparisons, risk assessment, and market insights. What would you like to know?",
  'ipo': "Based on current market data, here are the top IPOs to watch:\n\n• **CMR Green Technologies** - AI Score 8/10, GMP ₹72. Strong order book in green energy.\n• **Hexagon Nutrition** - AI Score 7/10, growing clinical nutrition market.\n\nWould you like a detailed analysis of any specific IPO?",
  'sip': "For a ₹10,000 monthly SIP at 12% expected return:\n\n• 5 years → ₹8.17 L (invested ₹6 L)\n• 10 years → ₹23.2 L (invested ₹12 L)\n• 20 years → ₹98.9 L (invested ₹24 L)\n\nThe power of compounding truly shines over longer periods. Would you like me to compare different fund categories?",
  'risk': "Here's my risk assessment framework:\n\n🟢 **Low Risk (1-3):** Large cap funds, blue-chip stocks, AAA-rated NCDs\n🟡 **Medium Risk (4-6):** Mid-cap funds, balanced funds, mainboard IPOs\n🔴 **High Risk (7-10):** Small cap, SME IPOs, sectoral funds\n\nWould you like me to assess risk for a specific investment?",
  'broker': "Here's my broker recommendation based on your profile:\n\n**For beginners:** Groww (simplest UI, free AMC)\n**For active traders:** Zerodha (best charting, Kite platform)\n**For research:** Angel One (free advisory, SmartAPI)\n\nWhat's your trading frequency and primary investment type?",
  'mutual': "Top performing mutual funds by category (2026):\n\n**Large Cap:** ICICI Pru Bluechip (+14.2% 1Y)\n**Mid Cap:** HDFC Mid-Cap Opp (+22.1% 1Y)\n**Small Cap:** Quant Small Cap (+28.2% 1Y)\n**Flexi Cap:** PPFAS Flexi Cap (+18.5% 1Y)\n\nShall I compare any two funds in detail?",
};

function getAIResponse(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('ipo') || lower.includes('listing') || lower.includes('subscribe')) return SAMPLE_RESPONSES['ipo'];
  if (lower.includes('sip') || lower.includes('systematic')) return SAMPLE_RESPONSES['sip'];
  if (lower.includes('risk') || lower.includes('safe')) return SAMPLE_RESPONSES['risk'];
  if (lower.includes('broker') || lower.includes('zerodha') || lower.includes('groww')) return SAMPLE_RESPONSES['broker'];
  if (lower.includes('mutual') || lower.includes('fund') || lower.includes('nav')) return SAMPLE_RESPONSES['mutual'];
  return SAMPLE_RESPONSES['default'];
}

export default function AIChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hi! I'm FinverseAI 🤖 I can help you analyze IPOs, compare mutual funds, assess risk, and answer investment questions. Try asking me about current IPOs or SIP returns!",
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    // Simulate AI response delay
    setTimeout(() => {
      const response: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: getAIResponse(userMessage.content),
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, response]);
      setIsTyping(false);
    }, 1000 + Math.random() * 1000);
  };

  const quickActions = [
    "Which IPOs should I apply for?",
    "Compare top brokers",
    "SIP of ₹10K for 10 years",
    "Analyze risk of SME IPOs",
  ];

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full shadow-lg flex items-center justify-center hover:shadow-xl transition-all hover:scale-105"
        aria-label="Open AI Chat"
      >
        {isOpen ? (
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-[380px] max-h-[600px] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm">⚡</span>
            </div>
            <div>
              <p className="text-white font-semibold text-sm">FinverseAI</p>
              <p className="text-blue-100 text-xs">Investment Research Assistant</p>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
              <span className="text-xs text-blue-100">Online</span>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[380px]">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-md'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-md'
                }`}>
                  <div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{
                    __html: msg.content
                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/\n/g, '<br/>')
                  }} />
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Actions */}
          {messages.length <= 2 && (
            <div className="px-4 pb-2 flex flex-wrap gap-1.5">
              {quickActions.map((action) => (
                <button
                  key={action}
                  onClick={() => { setInput(action); }}
                  className="px-2.5 py-1 text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                >
                  {action}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask about IPOs, funds, risk..."
                className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
