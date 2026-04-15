import { useState } from 'react';
import { copyToClipboard, downloadCSV } from '../lib/exporter';
import type { Platform } from '../types';

interface PlatformBlockProps {
  platform: Platform;
  locations: string[];
  hasSelectedClusters: boolean;
}

export default function PlatformBlock({ platform, locations, hasSelectedClusters }: PlatformBlockProps) {
  const [copied, setCopied] = useState(false);

  const isGoogle = platform === 'GOOGLE';
  const label = isGoogle ? 'Google Ads' : 'Bing Ads';
  const borderColor = isGoogle ? 'border-blue-400' : 'border-teal-400';
  const headerBg = isGoogle ? 'bg-blue-600' : 'bg-teal-600';
  const btnBase = isGoogle
    ? 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
    : 'bg-teal-600 hover:bg-teal-700 focus:ring-teal-500';
  const badge = isGoogle ? 'bg-blue-100 text-blue-700' : 'bg-teal-100 text-teal-700';

  async function handleCopy() {
    if (!locations.length) return;
    await copyToClipboard(locations.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    if (!locations.length) return;
    const filename = `${label.replace(' ', '_')}_locations.csv`;
    downloadCSV(locations, filename);
  }

  return (
    <div className={`flex flex-col border-2 ${borderColor} rounded-xl overflow-hidden flex-1 min-w-0 shadow-sm`}>
      {/* Header */}
      <div className={`${headerBg} px-4 py-3 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold text-sm">{label}</span>
          {locations.length > 0 && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge}`}>
              {locations.length}
            </span>
          )}
        </div>
        {locations.length > 0 && (
          <div className="flex gap-1.5">
            <button
              onClick={handleCopy}
              className="px-2.5 py-1 text-xs bg-white/20 hover:bg-white/30 text-white rounded transition-colors"
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
            <button
              onClick={handleDownload}
              className="px-2.5 py-1 text-xs bg-white/20 hover:bg-white/30 text-white rounded transition-colors"
            >
              CSV
            </button>
          </div>
        )}
      </div>

      {/* Location list */}
      <div className="flex-1 overflow-y-auto bg-white min-h-0">
        {!hasSelectedClusters ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-300">
            <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            <p className="text-xs">Select clusters from the sidebar</p>
          </div>
        ) : locations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 px-4 text-center">
            <p className="text-sm text-amber-600 font-medium">No locations found</p>
            <p className="text-xs text-gray-400 mt-1">
              No {label} data in the selected clusters
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {locations.map((loc, i) => (
              <li
                key={i}
                className="px-3 py-1 text-xs text-gray-700 font-mono hover:bg-gray-50 leading-relaxed"
              >
                {loc}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer actions */}
      {locations.length > 0 && (
        <div className="border-t border-gray-100 p-2 bg-gray-50 flex gap-2">
          <button
            onClick={handleCopy}
            className={`flex-1 py-1.5 text-xs text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${btnBase}`}
          >
            {copied ? '✓ Copied to Clipboard' : 'Copy to Clipboard'}
          </button>
          <button
            onClick={handleDownload}
            className={`flex-1 py-1.5 text-xs text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${btnBase}`}
          >
            Download CSV
          </button>
        </div>
      )}
    </div>
  );
}
