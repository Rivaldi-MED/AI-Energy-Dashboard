import React, { useState, useEffect } from 'react';
import { DashboardData } from './types';
import { Header } from './components/Header';
import { CompanyOverview } from './components/CompanyOverview';
import { PlantView } from './components/PlantView';
import { ActionRegister } from './components/ActionRegister';
import { DataQualityAndMethod } from './components/DataQualityAndMethod';
import { AskDataAssistant } from './components/AskDataAssistant';
import { JsonDropModal } from './components/JsonDropModal';
import { AlertCircle, Loader2, UploadCloud } from 'lucide-react';

export const App: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Tab & SEU selection
  const [activeTab, setActiveTab] = useState<string>('company');
  const [selectedSeuByPlant, setSelectedSeuByPlant] = useState<Record<string, string>>({});

  // Theme
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved) return saved === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Modals & Panels
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);

  // Apply dark mode class to html element
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // Initial load: fetch /dashboard_data.json
  const loadDefaultData = async () => {
    try {
      setLoading(true);
      setFetchError(null);
      const res = await fetch('/dashboard_data.json');
      if (!res.ok) {
        throw new Error(`Failed to fetch /dashboard_data.json (Status ${res.status})`);
      }
      const json = await res.json();
      if (json.schema_version !== '1.0') {
        throw new Error(`Invalid schema version: ${json.schema_version}`);
      }
      setData(json);
    } catch (err: any) {
      console.warn('Could not load /dashboard_data.json automatically:', err);
      setFetchError(err.message || 'Could not fetch default dataset.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDefaultData();
  }, []);

  const handleSelectSeu = (plantId: string, seuId: string) => {
    setSelectedSeuByPlant((prev) => ({
      ...prev,
      [plantId]: seuId,
    }));
    setActiveTab(plantId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectPlant = (plantId: string) => {
    setActiveTab(plantId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen flex flex-col bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 transition-colors">
      {/* Loading state */}
      {loading && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-neutral-500">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-3" />
          <p className="text-sm font-medium">Loading ISO 50001 Energy Performance Dashboard...</p>
        </div>
      )}

      {/* Fetch error fallback: allow user to drop in file */}
      {!loading && !data && (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xl text-center space-y-4">
            <div className="w-12 h-12 bg-amber-100 dark:bg-amber-950/60 rounded-full flex items-center justify-center mx-auto text-amber-600">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                Dataset Not Found
              </h2>
              <p className="text-xs text-neutral-500 mt-1">
                {fetchError || 'Could not load default dashboard_data.json.'}
              </p>
            </div>
            <button
              onClick={() => setUploadModalOpen(true)}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-md transition-colors flex items-center justify-center gap-2"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Upload or Drop dashboard_data.json</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Dashboard Screen */}
      {!loading && data && (
        <>
          <Header
            data={data}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            darkMode={darkMode}
            onToggleDarkMode={() => setDarkMode(!darkMode)}
            onOpenUpload={() => setUploadModalOpen(true)}
            onPrint={handlePrint}
            aiAssistantOpen={aiAssistantOpen}
            onToggleAiAssistant={() => setAiAssistantOpen(!aiAssistantOpen)}
          />

          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
            {activeTab === 'company' && (
              <CompanyOverview
                data={data}
                onSelectSeu={handleSelectSeu}
                onSelectPlant={handleSelectPlant}
              />
            )}

            {activeTab === 'register' && (
              <ActionRegister
                data={data}
                onSelectSeu={handleSelectSeu}
                onPrint={handlePrint}
              />
            )}

            {activeTab === 'method' && (
              <DataQualityAndMethod data={data} />
            )}

            {/* Individual Plant View */}
            {data.plants.some((p) => p.plant === activeTab) && (
              <PlantView
                plant={data.plants.find((p) => p.plant === activeTab)!}
                meta={data.meta}
                selectedSeuId={selectedSeuByPlant[activeTab]}
                onSelectSeuId={(seuId) =>
                  setSelectedSeuByPlant((prev) => ({ ...prev, [activeTab]: seuId }))
                }
              />
            )}
          </main>

          {/* Footer note */}
          <footer className="border-t border-neutral-200 dark:border-neutral-800 py-4 px-6 text-center text-xs text-neutral-500 dark:text-neutral-500 no-print">
            ISO 50001 Energy Performance & Regression Dashboard • Report Month {data.meta.report_month} • Baseline {data.meta.baseline.start} to {data.meta.baseline.end}
          </footer>

          {/* Optional Gemini Assistant Drawer */}
          <AskDataAssistant
            data={data}
            isOpen={aiAssistantOpen}
            onClose={() => setAiAssistantOpen(false)}
          />

          {/* JSON File Drop Modal */}
          <JsonDropModal
            isOpen={uploadModalOpen}
            onClose={() => setUploadModalOpen(false)}
            onDataLoaded={(newData) => {
              setData(newData);
              setActiveTab('company');
            }}
            onResetDefault={loadDefaultData}
          />
        </>
      )}
    </div>
  );
};
export default App;
