import { useState } from 'react';
import type { AppData } from './types';
import { loadData, saveData } from './lib/storage';
import Sidebar from './components/Sidebar';
import ResultsPanel from './components/ResultsPanel';
import UploadModal from './components/UploadModal';
import CityModal from './components/CityModal';
import OrphansTab from './components/OrphansTab';

type ActiveTab = 'results' | 'orphans';

export default function App() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<ActiveTab>('results');
  const [showUpload, setShowUpload] = useState(false);
  const [showCityModal, setShowCityModal] = useState(false);
  const [editCityId, setEditCityId] = useState<string | undefined>();

  function updateData(next: AppData) {
    setData(next);
    saveData(next);
    // Prune selected IDs that no longer exist
    const validIds = new Set(next.clusters.map(c => c.id));
    setSelectedIds(prev => {
      const pruned = new Set([...prev].filter(id => validIds.has(id)));
      return pruned;
    });
  }

  function toggleCluster(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(data.clusters.map(c => c.id)));
  }

  function clearAll() {
    setSelectedIds(new Set());
  }

  function openAddCity() {
    setEditCityId(undefined);
    setShowCityModal(true);
  }

  function openEditCity(id: string) {
    setEditCityId(id);
    setShowCityModal(true);
  }

  function deleteCity(id: string) {
    const cluster = data.clusters.find(c => c.id === id);
    if (!cluster) return;
    if (!window.confirm(`Delete cluster "${cluster.name}" and all its locations?`)) return;
    updateData({
      clusters: data.clusters.filter(c => c.id !== id),
      locations: data.locations.filter(l => l.clusterId !== id),
    });
  }

  const orphanCount = data.clusters.filter(cluster => {
    const locs = data.locations.filter(l => l.clusterId === cluster.id);
    return !locs.some(l => l.platform === 'GOOGLE') || !locs.some(l => l.platform === 'BING');
  }).length;

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <Sidebar
        data={data}
        selectedIds={selectedIds}
        onToggle={toggleCluster}
        onSelectAll={selectAll}
        onClearAll={clearAll}
        onAddCity={openAddCity}
        onEditCity={openEditCity}
        onDeleteCity={deleteCity}
        onUpload={() => setShowUpload(true)}
      />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Tab bar */}
        <div className="border-b border-gray-200 bg-white px-1 flex items-end">
          <button
            onClick={() => setActiveTab('results')}
            className={`px-5 py-3 text-sm border-b-2 transition-colors ${
              activeTab === 'results'
                ? 'border-indigo-600 text-indigo-600 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Results
          </button>
          <button
            onClick={() => setActiveTab('orphans')}
            className={`px-5 py-3 text-sm border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'orphans'
                ? 'border-indigo-600 text-indigo-600 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Unmapped / Orphans
            {orphanCount > 0 && (
              <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
                {orphanCount}
              </span>
            )}
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {activeTab === 'results' ? (
            <ResultsPanel data={data} selectedIds={selectedIds} />
          ) : (
            <div className="h-full overflow-y-auto">
              <OrphansTab data={data} onSave={updateData} />
            </div>
          )}
        </div>
      </main>

      {showUpload && (
        <UploadModal
          existing={data}
          onClose={() => setShowUpload(false)}
          onImport={next => {
            updateData(next);
            setShowUpload(false);
          }}
        />
      )}

      {showCityModal && (
        <CityModal
          existing={data}
          editClusterId={editCityId}
          onClose={() => setShowCityModal(false)}
          onSave={next => {
            updateData(next);
            setShowCityModal(false);
          }}
        />
      )}
    </div>
  );
}
