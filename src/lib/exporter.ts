/** Copy a newline-separated list of locations to the clipboard. */
export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

/** Trigger a CSV file download with a single "Location" column. */
export function downloadCSV(locations: string[], filename: string): void {
  const rows = locations.map(l => `"${l.replace(/"/g, '""')}"`);
  const content = 'Location\n' + rows.join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
