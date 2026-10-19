import React, { useState } from 'react';
import { DashboardData } from '../types';
import { MessageSquare, Send, X, Bot, User, Sparkles, AlertCircle, Loader2 } from 'lucide-react';

interface AskDataAssistantProps {
  data: DashboardData;
  isOpen: boolean;
  onClose: () => void;
}

interface Message {
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

export const AskDataAssistant: React.FC<AskDataAssistantProps> = ({
  data,
  isOpen,
  onClose,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      text: `Hello! I am your ISO 50001 Energy Performance Data Assistant. I can answer questions about the current monthly dataset for report month ${data.meta.report_month}.

You can ask me questions like:
• "Which SEU has the highest annualized excess cost and why?"
• "What are the recommended actions for Plant A's powder dryer?"
• "Which SEUs are currently classified as activity-driven?"
• "What are the baseline model parameters for the recovery compressor?"`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Build condensed context to avoid sending large 36-month arrays
  const buildCondensedContext = () => {
    return {
      meta: {
        report_month: data.meta.report_month,
        baseline: data.meta.baseline,
        band_pct: data.meta.band_pct,
        unit_energy: data.meta.unit_energy,
        currency: data.meta.currency,
      },
      company: {
        totals_last_12m: data.company.totals_last_12m,
        top_seus: data.company.top_seus,
        summary: data.company.summary,
      },
      plants: data.plants.map((p) => ({
        plant: p.plant,
        plant_name: p.plant_name,
        summary: p.summary,
        activity_note: p.activity_note,
        kpis: p.kpis,
        seus: p.seus.map((s) => ({
          seu: s.seu,
          seu_name: s.seu_name,
          carrier: s.carrier,
          status: s.status,
          verdict: s.verdict,
          pattern: s.pattern,
          model: {
            r2: s.model.r2,
            cv_rmse_pct: s.model.cv_rmse_pct,
            baseline_sec_gj_per_ton: s.model.baseline_sec_gj_per_ton,
            base_load_share_pct: s.model.base_load_share_pct,
            variables: s.model.variables,
            quality: s.model.quality,
          },
          why: s.why,
          diagnosis: s.diagnosis,
          corrective_actions: s.corrective_actions,
          savings: s.savings,
        })),
      })),
    };
  };

  const handleSend = async (questionText?: string) => {
    const q = questionText || input;
    if (!q.trim() || loading) return;

    const userMsg: Message = {
      role: 'user',
      text: q,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const condensedContext = buildCondensedContext();
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          context: condensedContext,
        }),
      });

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }

      const result = await res.json();
      if (result.error) {
        throw new Error(result.error);
      }

      const botMsg: Message = {
        role: 'assistant',
        text: result.answer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to query assistant.');
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `Error: ${err.message || 'Could not communicate with the assistant. Check if GEMINI_API_KEY is configured.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const sampleQuestions = [
    'Which SEU is driving the most excess cost across all plants?',
    'Explain the powder dryer step change in Plant A',
    'What are the root cause hypotheses for the recovery compressor?',
    'Which plant has an activity-driven SEC increase?',
  ];

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[460px] bg-white dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-800 shadow-2xl flex flex-col no-print transition-all">
      {/* Drawer Header */}
      <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50 dark:bg-neutral-800/60">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-600 text-white">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
              Ask the Energy Data
              <span className="text-[10px] px-1.5 py-0.2 bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 rounded font-normal">
                Gemini Powered
              </span>
            </h3>
            <p className="text-[11px] text-neutral-500">ISO 50001 grounded Q&A</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-500"
          aria-label="Close assistant"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Privacy Notice Banner */}
      <div className="bg-blue-50 dark:bg-blue-950/40 p-2.5 border-b border-blue-200 dark:border-blue-900/60 text-[11px] text-blue-900 dark:text-blue-300 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <span>
          <strong>Data Privacy Note:</strong> When you send a query, a condensed summary of your current dashboard JSON is sent to the server-side Gemini API to generate the response.
        </span>
      </div>

      {/* Messages List */}
      <div className="grow overflow-y-auto p-4 space-y-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {m.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold">
                <Bot className="w-3.5 h-3.5" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-xl p-3 text-xs leading-relaxed ${
                m.role === 'user'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 whitespace-pre-wrap'
              }`}
            >
              {m.text}
              <div
                className={`mt-1 text-[10px] text-right ${
                  m.role === 'user' ? 'text-blue-200' : 'text-neutral-400'
                }`}
              >
                {m.timestamp}
              </div>
            </div>
            {m.role === 'user' && (
              <div className="w-6 h-6 rounded-full bg-neutral-700 text-white flex items-center justify-center shrink-0 mt-0.5 text-xs">
                <User className="w-3.5 h-3.5" />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-neutral-500 p-2">
            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
            <span>Analyzing energy records and EnPI baselines...</span>
          </div>
        )}
      </div>

      {/* Suggested Quick Questions */}
      <div className="p-3 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850">
        <div className="text-[11px] font-semibold text-neutral-500 mb-2">Suggested queries:</div>
        <div className="flex flex-wrap gap-1.5">
          {sampleQuestions.map((sq, i) => (
            <button
              key={i}
              onClick={() => handleSend(sq)}
              disabled={loading}
              className="text-[11px] text-left px-2 py-1 rounded-md bg-white dark:bg-neutral-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 transition-colors"
            >
              {sq}
            </button>
          ))}
        </div>
      </div>

      {/* Input Box */}
      <div className="p-3 border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about plants, SEUs, or baseline models..."
            disabled={loading}
            className="grow px-3 py-2 text-xs rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Send query"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
