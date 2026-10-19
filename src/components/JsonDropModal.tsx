import React, { useState } from 'react';
import { DashboardData } from '../types';
import { UploadCloud, FileJson, X, AlertCircle, RotateCcw, CheckCircle2 } from 'lucide-react';

interface JsonDropModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataLoaded: (data: DashboardData) => void;
  onResetDefault: () => void;
}

export const JsonDropModal: React.FC<JsonDropModalProps> = ({
  isOpen,
  onClose,
  onDataLoaded,
  onResetDefault,
}) => {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const validateAndLoadJson = (jsonString: string) => {
    try {
      setError(null);
      setSuccess(null);
      const parsed = JSON.parse(jsonString);

      // Validation per data contract
      if (parsed.schema_version !== '1.0') {
        throw new Error(`Invalid schema_version: Expected "1.0", but got "${parsed.schema_version}".`);
      }

      const requiredKeys = ['meta', 'company', 'plants', 'data_quality', 'method'];
      for (const k of requiredKeys) {
        if (!(k in parsed)) {
          throw new Error(`Missing required root key: "${k}". Please ensure the JSON matches ISO 50001 schema 1.0.`);
        }
      }

      if (!Array.isArray(parsed.plants) || parsed.plants.length === 0) {
        throw new Error('Key "plants" must be a non-empty array.');
      }

      setSuccess(`Successfully loaded report month ${parsed.meta.report_month || 'dataset'} with ${parsed.plants.length} plant(s)!`);
      setTimeout(() => {
        onDataLoaded(parsed);
        onClose();
      }, 1000);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to parse JSON file.');
    }
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      validateAndLoadJson(content);
    };
    reader.readAsText(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      validateAndLoadJson(content);
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs no-print">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
          aria-label="Close dialog"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-2">
          <FileJson className="w-5 h-5 text-blue-600" />
          <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
            Load Monthly Energy Dataset
          </h3>
        </div>
        <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-4">
          Drop in a newly generated <code className="font-mono bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded">dashboard_data.json</code> file to update all plants, baselines, and regressions with zero code changes.
        </p>

        {/* Drag and Drop Zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleFileDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
            dragOver
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40'
              : 'border-neutral-300 dark:border-neutral-700 hover:border-neutral-400 bg-neutral-50/50 dark:bg-neutral-850'
          }`}
        >
          <UploadCloud className="w-10 h-10 mx-auto text-neutral-400 mb-2" />
          <div className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
            Drag and drop JSON here
          </div>
          <div className="text-xs text-neutral-500 mt-1 mb-3">or browse from your computer</div>

          <label className="inline-flex items-center px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 hover:opacity-90 cursor-pointer shadow-xs">
            <span>Select JSON File</span>
            <input
              type="file"
              accept=".json"
              onChange={handleFileInput}
              className="hidden"
            />
          </label>
        </div>

        {/* Status Messages */}
        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-800 dark:text-red-300 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <strong>Validation Error:</strong> {error}
            </div>
          </div>
        )}

        {success && (
          <div className="mt-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Footer with Reset Option */}
        <div className="mt-5 pt-4 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-xs">
          <button
            onClick={() => {
              onResetDefault();
              setSuccess('Reset back to bundled default demo data.');
              setTimeout(() => {
                onClose();
              }, 800);
            }}
            className="inline-flex items-center gap-1.5 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to bundled demo data</span>
          </button>

          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
