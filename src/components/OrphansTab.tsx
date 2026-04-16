import { useState } from 'react';
import type { AppData } from '../types';

interface OrphansTabProps {
  data: AppData;
  onSave: (data: AppData) => void;
}

interface OrphanInfo {
  id: string;
  name: string;
  googleCount: number;
  bingCount: number;
  hasGoogle: boolean;
  hasBing: boolean;
}

export default function OrphansTab({ data, onSave }: OrphansTabProps) {
  const [assignments, setAssignments] = useState<Record<string, string>>({});

  const orphans: OrphanInfo[] = data.clusters
    .map(cluster => {
      const locs = data.locations.filter(l => l.clusterId === cluster.id);
      const googleCount = locs.filter(l => l.platform === 'GOOGLE').length;
      const bingCount = locs.filter(l => l.platform === 'BING').length;
      return {
        id: cluster.id,
        name: cluster.name,
        googleCount,
        bingCount,
        hasGoogle: googleCount > 0,
        hasBing: bingCount > 0,
      };
    })
    .filter(o => !o.hasGoogle || !o.hasBing)
    .sort((a, b) => a.name.localeCompare(b.name));

  function handleMerge(fromId: string) {
    const toId = assignments[fromId];
    if (!toId || toId === fromId) return;

    const newLocations = data.locations.map(l =>
      l.clusterId === fromId ? { ...l, clusterId: toId } : l
    );
    const newClusters = data.clusters.filter(c => c.id !== fromId);
    onSave({ clusters: newClusters, locations: newLocations });

    setAssignments(prev => {
      const next = { ...prev };
      delete next[fromId];
      return next;
    });
  }

  if (orphans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400 p-8 text-center">
        <svg className="w-12 h-12 mb-3 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm font-medium text-gray-500">All clusters are fully mapped</p>
        <p className="text-xs mt-1">Every cluster has locations for both Google and Bing.</p>
      </div>
    );
  }

  return (
    <div className="p-5">
      <div className="mb-4">
        <h3 className="font-semibold text-gray-700 text-sm">
          Unmapped / Orphan Clusters
          <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-normal">
            {orphans.length}
          </span>
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          These clusters have locations on only one platform. Use the dropdown to merge them
          into another cluster, or leave them as separate entries.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-left text-gray-500">
              <th className="px-4 py-2.5 font-semibold">Cluster</th>
              <th className="px-3 py-2.5 font-semibold text-center text-blue-600">Google</th>
              <th className="px-3 py-2.5 font-semibold text-center text-teal-600">Bing</th>
              <th className="px-4 py-2.5 font-semibold">Missing</th>
              <th className="px-4 py-2.5 font-semibold">Merge into</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {orphans.map(orphan => (
              <tr key={orphan.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-semibold text-gray-700">{orphan.name}</td>
                <td className="px-3 py-3 text-center">
                  {orphan.hasGoogle ? (
                    <span className="text-blue-600 font-medium">{orphan.googleCount}</span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-3 py-3 text-center">
                  {orphan.hasBing ? (
                    <span className="text-teal-600 font-medium">{orphan.bingCount}</span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {!orphan.hasGoogle && (
                    <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                      Google
                    </span>
                  )}
                  {!orphan.hasBing && (
                    <span className="bg-teal-50 text-teal-600 px-2 py-0.5 rounded-full">
                      Bing
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={assignments[orphan.id] ?? ''}
                    onChange={e =>
                      setAssignments(prev => ({ ...prev, [orphan.id]: e.target.value }))
                    }
                    className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-indigo-400 bg-white w-40"
                  >
                    <option value="">— keep separate —</option>
                    {data.clusters
                      .filter(c => c.id !== orphan.id)
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </td>
                <td className="px-3 py-3">
                  <button
                    onClick={() => handleMerge(orphan.id)}
                    disabled={!assignments[orphan.id]}
                    className="px-3 py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    Merge
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
