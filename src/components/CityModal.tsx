import { useState } from 'react';
import type { AppData } from '../types';

interface CityModalProps {
  existing: AppData;
  editClusterId?: string;
  onClose: () => void;
  onSave: (data: AppData) => void;
}

function genId(): string {
  return crypto.randomUUID();
}

function parseLines(text: string): string[] {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
}

export default function CityModal({ existing, editClusterId, onClose, onSave }: CityModalProps) {
  const editCluster = editClusterId
    ? existing.clusters.find(c => c.id === editClusterId)
    : null;

  const initialGoogle = editClusterId
    ? existing.locations
        .filter(l => l.clusterId === editClusterId && l.platform === 'GOOGLE')
        .map(l => l.value)
        .join('\n')
    : '';

  const initialBing = editClusterId
    ? existing.locations
        .filter(l => l.clusterId === editClusterId && l.platform === 'BING')
        .map(l => l.value)
        .join('\n')
    : '';

  const [name, setName] = useState(editCluster?.name ?? '');
  const [googleText, setGoogleText] = useState(initialGoogle);
  const [bingText, setBingText] = useState(initialBing);
  const [error, setError] = useState('');

  const isEditing = Boolean(editClusterId);

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('City name is required.');
      return;
    }
    const duplicate = existing.clusters.some(
      c => c.name.toLowerCase() === trimmed.toLowerCase() && c.id !== editClusterId
    );
    if (duplicate) {
      setError('A cluster with this name already exists.');
      return;
    }

    let clusters = [...existing.clusters];
    // Remove existing locations for this cluster (will be replaced)
    let locations = existing.locations.filter(l => l.clusterId !== editClusterId);

    let clusterId = editClusterId;
    if (!clusterId) {
      clusterId = genId();
      clusters.push({ id: clusterId, name: trimmed });
    } else {
      clusters = clusters.map(c =>
        c.id === clusterId ? { ...c, name: trimmed } : c
      );
    }

    for (const val of parseLines(googleText)) {
      locations.push({ id: genId(), value: val, platform: 'GOOGLE', clusterId });
    }
    for (const val of parseLines(bingText)) {
      locations.push({ id: genId(), value: val, platform: 'BING', clusterId });
    }

    onSave({ clusters, locations });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="font-bold text-gray-800 text-base">
            {isEditing ? 'Edit City' : 'Add New City'}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {isEditing
              ? 'Update the cluster name and its location lists.'
              : 'Create a new cluster and add locations for each platform.'}
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              City / Cluster Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. San Diego"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
            />
          </div>

          {/* Google locations */}
          <div>
            <label className="block text-xs font-semibold text-blue-600 mb-1.5">
              Google Locations
              <span className="text-gray-400 font-normal ml-1">(one per line)</span>
            </label>
            <textarea
              value={googleText}
              onChange={e => setGoogleText(e.target.value)}
              placeholder={'92374, California, United States\n92270, California, United States'}
              rows={5}
              className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono resize-y leading-relaxed"
            />
            {googleText && (
              <p className="text-xs text-gray-400 mt-1">
                {parseLines(googleText).length} location(s)
              </p>
            )}
          </div>

          {/* Bing locations */}
          <div>
            <label className="block text-xs font-semibold text-teal-600 mb-1.5">
              Bing Locations
              <span className="text-gray-400 font-normal ml-1">(one per line)</span>
            </label>
            <textarea
              value={bingText}
              onChange={e => setBingText(e.target.value)}
              placeholder={'15 miles around San Diego, California, United States\n92139, California, United States (zip code)'}
              rows={5}
              className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-teal-400 font-mono resize-y leading-relaxed"
            />
            {bingText && (
              <p className="text-xs text-gray-400 mt-1">
                {parseLines(bingText).length} location(s)
              </p>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
          >
            {isEditing ? 'Save Changes' : 'Add City'}
          </button>
        </div>
      </div>
    </div>
  );
}
