/**
 * ExportButton Component
 * Button to export data to CSV
 */

import { exportToCSV } from '../../utils/csvExport';

interface ExportButtonProps<T extends Record<string, unknown>> {
  data: T[];
  filename: string;
  columns?: { key: keyof T | string; header: string }[];
  label?: string;
}

export function ExportButton<T extends Record<string, unknown>>({ 
  data, 
  filename, 
  columns,
  label = 'Export CSV'
}: ExportButtonProps<T>) {
  const handleExport = () => {
    exportToCSV(data, filename, columns);
  };

  return (
    <button
      onClick={handleExport}
      disabled={data.length === 0}
      className="border border-border bg-card px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-muted hover:text-foreground hover:border-accent disabled:opacity-50"
    >
      {label}
    </button>
  );
}
