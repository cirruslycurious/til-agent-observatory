/**
 * DataTable Component
 * Simple table for dashboard data display
 */

interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (item: T) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  emptyMessage?: string;
}

export function DataTable<T extends Record<string, unknown>>({ 
  columns, 
  data,
  emptyMessage = 'No data available'
}: DataTableProps<T>) {
  const alignClass = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  };

  if (data.length === 0) {
    return (
      <div className="tactical-panel p-6 text-center text-muted">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto tactical-panel">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th
                key={String(col.key)}
                className={`px-4 py-3 text-[11px] uppercase tracking-[0.12em] text-muted ${alignClass[col.align || 'left']}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr 
              key={idx} 
              className="border-b border-border/60 last:border-0 hover:bg-muted/20"
            >
              {columns.map((col) => (
                <td
                  key={String(col.key)}
                  className={`px-4 py-3 text-sm text-foreground ${alignClass[col.align || 'left']}`}
                >
                  {col.render 
                    ? col.render(row) 
                    : String(row[col.key as keyof T] ?? '-')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
