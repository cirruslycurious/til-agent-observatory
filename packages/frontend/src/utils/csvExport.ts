/**
 * CSV Export Utility
 * Converts data to CSV and triggers download
 */

export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  filename: string,
  columns?: { key: keyof T | string; header: string }[]
): void {
  if (data.length === 0) {
    console.warn('No data to export');
    return;
  }

  // Determine columns from data if not provided
  const cols = columns || Object.keys(data[0]).map(key => ({ key, header: key }));

  // Build CSV content
  const headerRow = cols.map(col => escapeCSV(col.header)).join(',');
  
  const dataRows = data.map(row => 
    cols.map(col => {
      const value = row[col.key as keyof T];
      return escapeCSV(formatValue(value));
    }).join(',')
  );

  const csvContent = [headerRow, ...dataRows].join('\n');

  // Trigger download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeCSV(value: string): string {
  // Escape double quotes and wrap in quotes if contains comma, newline, or quote
  if (value.includes(',') || value.includes('\n') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    // Handle RateWithCI objects
    if ('rate' in (value as object) && 'n' in (value as object)) {
      const rate = value as { rate: number; n: number };
      return `${(rate.rate * 100).toFixed(1)}% (n=${rate.n})`;
    }
    return JSON.stringify(value);
  }
  return String(value);
}
