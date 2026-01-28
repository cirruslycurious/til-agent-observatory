import { ReactNode } from "react";

interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (value: any, row: T) => ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
}

interface TacticalTableProps<T> {
  columns: Column<T>[];
  data: T[];
  className?: string;
  onRowClick?: (row: T) => void;
}

export function TacticalTable<T extends Record<string, any>>({ 
  columns, 
  data, 
  className = "",
  onRowClick 
}: TacticalTableProps<T>) {
  const getNestedValue = (obj: T, path: string) => {
    return path.split('.').reduce((acc, part) => acc?.[part], obj as any);
  };

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-sm">
        <thead className="border-b border-border">
          <tr>
            {columns.map((col) => (
              <th 
                key={String(col.key)} 
                className={`
                  py-3 px-4 text-left font-mono text-xs uppercase tracking-wider text-muted-foreground
                  ${col.align === "center" && "text-center"}
                  ${col.align === "right" && "text-right"}
                  ${col.className || ""}
                `}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr 
              key={rowIndex}
              onClick={() => onRowClick?.(row)}
              className={`
                transition-colors hover:bg-primary/5
                ${onRowClick ? "cursor-pointer" : ""}
              `}
            >
              {columns.map((col) => {
                const value = getNestedValue(row, String(col.key));
                return (
                  <td 
                    key={String(col.key)}
                    className={`
                      py-3 px-4 font-mono text-sm border-b border-border/50
                      ${col.align === "center" && "text-center"}
                      ${col.align === "right" && "text-right"}
                      ${col.className || ""}
                    `}
                  >
                    {col.render ? col.render(value, row) : value}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length === 0 && (
        <div className="py-8 text-center text-muted-foreground font-mono text-sm">
          No data available
        </div>
      )}
    </div>
  );
}
