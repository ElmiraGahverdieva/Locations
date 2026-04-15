import type { AppData } from '../types';
import PlatformBlock from './PlatformBlock';

interface ResultsPanelProps {
  data: AppData;
  selectedIds: Set<string>;
}

export default function ResultsPanel({ data, selectedIds }: ResultsPanelProps) {
  const selectedClusters = data.clusters.filter(c => selectedIds.has(c.id));
  const clusterIdSet = new Set(selectedClusters.map(c => c.id));
  const selectedLocations = data.locations.filter(l => clusterIdSet.has(l.clusterId));

  // Deduplicate per platform, then sort
  const googleLocs = [
    ...new Set(selectedLocations.filter(l => l.platform === 'GOOGLE').map(l => l.value)),
  ].sort((a, b) => a.localeCompare(b));

  const bingLocs = [
    ...new Set(selectedLocations.filter(l => l.platform === 'BING').map(l => l.value)),
  ].sort((a, b) => a.localeCompare(b));

  const hasSelected = selectedIds.size > 0;
  const totalCount = googleLocs.length + bingLocs.length;

  return (
    <div className="flex flex-col h-full">
      {/* Sub-header */}
      <div className="px-5 py-3 border-b border-gray-200 bg-white flex items-center gap-3">
        <h2 className="font-semibold text-gray-700 text-sm">Results</h2>
        {hasSelected && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
              {selectedClusters.length} cluster{selectedClusters.length !== 1 ? 's' : ''}
            </span>
            <span>·</span>
            <span>{totalCount} total locations</span>
          </div>
        )}
      </div>

      {/* Two-column platform blocks */}
      <div className="flex gap-4 p-4 flex-1 min-h-0">
        <PlatformBlock
          platform="GOOGLE"
          locations={googleLocs}
          hasSelectedClusters={hasSelected}
        />
        <PlatformBlock
          platform="BING"
          locations={bingLocs}
          hasSelectedClusters={hasSelected}
        />
      </div>
    </div>
  );
}
