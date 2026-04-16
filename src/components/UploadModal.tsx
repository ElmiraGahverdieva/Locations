import { useState } from 'react';
import { parseCSVText, mergeCSVRows } from '../lib/csvParser';
import type { AppData } from '../types';

interface UploadModalProps {
  existing: AppData;
  onClose: () => void;
  onImport: (data: AppData) => void;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file, 'utf-8');
  });
}

export default function UploadModal({ existing, onClose, onImport }: UploadModalProps) {
  const [googleFile, setGoogleFile] = useState<File | null>(null);
  const [bingFile, setBingFile] = useState<File | null>(null);
  const [clearFirst, setClearFirst] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleImport() {
    if (!googleFile && !bingFile) {
      setError('Please select at least one CSV file.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      let base: AppData = clearFirst ? { clusters: [], locations: [] } : existing;

      if (googleFile) {
        const text = await readFileAsText(googleFile);
        const rows = parseCSVText(text);
        base = mergeCSVRows(base, rows);
      }
      if (bingFile) {
        const text = await readFileAsText(bingFile);
        const rows = parseCSVText(text);
        base = mergeCSVRows(base, rows);
      }

      onImport(base);
    } catch {
      setError('Failed to parse file. Please check the CSV format and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="font-bold text-gray-800 text-base">Upload CSV Files</h2>
          <p className="text-xs text-gray-500 mt-1">
            Import location data from Google Ads and Bing Ads exports.
            Required columns: <code className="bg-gray-100 px-1 rounded">Location</code>,{' '}
            <code className="bg-gray-100 px-1 rounded">Campaign</code>,{' '}
            <code className="bg-gray-100 px-1 rounded">Platform</code>.
          </p>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Google file */}
          <div>
            <label className="block text-xs font-semibold text-blue-600 mb-1.5">
              Google Ads CSV
            </label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={e => setGoogleFile(e.target.files?.[0] ?? null)}
              className="block w-full text-xs text-gray-500
                file:mr-3 file:py-1.5 file:px-3
                file:border-0 file:rounded-lg file:text-xs file:font-medium
                file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
            />
            {googleFile && (
              <p className="text-xs text-green-600 mt-1">✓ {googleFile.name}</p>
            )}
          </div>

          {/* Bing file */}
          <div>
            <label className="block text-xs font-semibold text-teal-600 mb-1.5">
              Bing Ads CSV
            </label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={e => setBingFile(e.target.files?.[0] ?? null)}
              className="block w-full text-xs text-gray-500
                file:mr-3 file:py-1.5 file:px-3
                file:border-0 file:rounded-lg file:text-xs file:font-medium
                file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 cursor-pointer"
            />
            {bingFile && (
              <p className="text-xs text-green-600 mt-1">✓ {bingFile.name}</p>
            )}
          </div>

          {/* Clear option */}
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={clearFirst}
              onChange={e => setClearFirst(e.target.checked)}
              className="mt-0.5 rounded accent-indigo-600"
            />
            <div>
              <span className="text-xs font-medium text-gray-700">
                Replace existing data
              </span>
              <p className="text-xs text-gray-400 mt-0.5">
                Clears all current clusters and locations before importing.
                Leave unchecked to merge into existing data.
              </p>
            </div>
          </label>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={loading}
            className="px-5 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors font-medium"
          >
            {loading ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
