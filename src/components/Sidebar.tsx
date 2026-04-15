import { useRef, useState } from 'react';
import type { AppData } from '../types';

interface SidebarProps {
  data: AppData;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onAddCity: () => void;
  onEditCity: (id: string) => void;
  onDeleteCity: (id: string) => void;
  onUpload: () => void;
}

export default function Sidebar({
  data,
  selectedIds,
  onToggle,
  onSelectAll,
  onClearAll,
  onAddCity,
  onEditCity,
  onDeleteCity,
  onUpload,
}: SidebarProps) {
  const [search, setSearch] = useState('');
  const selectAllRef = useRef<HTMLInputElement>(null);

  const filtered = data.clusters
    .filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const allSelected =
    data.clusters.length > 0 && data.clusters.every(c => selectedIds.has(c.id));
  const someSelected = !allSelected && data.clusters.some(c => selectedIds.has(c.id));

  // Set indeterminate state on the DOM element
  if (selectAllRef.current) {
    selectAllRef.current.indeterminate = someSelected;
  }

  return (
    <aside className="w-72 border-r border-gray-200 flex flex-col bg-white flex-shrink-0">
      {/* Brand header */}
      <div className="px-4 py-4 bg-indigo-700 text-white">
        <h1 className="font-bold text-base tracking-wide">GeoTarget Builder</h1>
        <p className="text-xs text-indigo-200 mt-0.5">
          {data.clusters.length} cluster{data.clusters.length !== 1 ? 's' : ''} ·{' '}
          {data.locations.length} locations
        </p>
      </div>

      {/* Action buttons */}
      <div className="px-3 py-2.5 border-b border-gray-100 flex gap-2">
        <button
          onClick={onUpload}
          className="flex-1 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
        >
          Upload CSV
        </button>
        <button
          onClick={onAddCity}
          className="flex-1 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
        >
          + Add City
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-gray-100">
        <input
          type="text"
          placeholder="Search clusters…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 bg-gray-50"
        />
      </div>

      {/* Select-all row */}
      {data.clusters.length > 0 && (
        <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-gray-600 font-medium">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allSelected}
              onChange={allSelected ? onClearAll : onSelectAll}
              className="rounded accent-indigo-600"
            />
            Select all ({data.clusters.length})
          </label>
          {selectedIds.size > 0 && (
            <button
              onClick={onClearAll}
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Cluster list */}
      <div className="flex-1 overflow-y-auto">
        {data.clusters.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-gray-400 font-medium">No clusters yet</p>
            <p className="text-xs text-gray-300 mt-1">Upload CSVs or add a city manually</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-4 text-xs text-gray-400">No clusters match your search.</p>
        ) : (
          <ul>
            {filtered.map(cluster => {
              const googleCount = data.locations.filter(
                l => l.clusterId === cluster.id && l.platform === 'GOOGLE'
              ).length;
              const bingCount = data.locations.filter(
                l => l.clusterId === cluster.id && l.platform === 'BING'
              ).length;
              const isSelected = selectedIds.has(cluster.id);

              return (
                <li
                  key={cluster.id}
                  className={`group flex items-center gap-2 px-3 py-2.5 border-b border-gray-50 transition-colors ${
                    isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggle(cluster.id)}
                    className="rounded accent-indigo-600 flex-shrink-0"
                  />
                  <button
                    onClick={() => onToggle(cluster.id)}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="text-xs font-semibold text-gray-700 truncate">
                      {cluster.name}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 flex gap-2">
                      <span className="text-blue-500">G: {googleCount}</span>
                      <span className="text-teal-500">B: {bingCount}</span>
                    </div>
                  </button>
                  {/* Edit/delete — visible on hover */}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); onEditCity(cluster.id); }}
                      title="Edit"
                      className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-indigo-600 transition-colors rounded"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); onDeleteCity(cluster.id); }}
                      title="Delete"
                      className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors rounded"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
