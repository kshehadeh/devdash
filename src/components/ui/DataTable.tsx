"use client";

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type PaginationState,
} from "@tanstack/react-table";

type AnyColumnDef<T> = ColumnDef<T, unknown>;
import { useState } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from "lucide-react";

interface DataTableProps<TData> {
  columns: AnyColumnDef<TData>[];
  data: TData[];
  searchPlaceholder?: string;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100];

export function DataTable<TData>({ columns, data, searchPlaceholder = "Search..." }: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });

  const table = useReactTable<TData>({
    data,
    columns,
    state: { sorting, columnFilters, globalFilter, pagination },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: true,
  });

  const { pageIndex, pageSize } = pagination;

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <input
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-72 bg-[var(--surface-container)] text-[var(--on-surface)] text-sm rounded-md px-3 py-2 outline-none focus:ring-1 focus:ring-[var(--primary)] placeholder:text-[var(--outline)]"
        />
        <div className="flex items-center gap-2 text-xs font-label text-[var(--on-surface-variant)]">
          <span>Rows per page</span>
          <select
            value={pageSize}
            onChange={(e) => {
              table.setPageSize(Number(e.target.value));
            }}
            className="bg-[var(--surface-container)] text-[var(--on-surface)] text-xs rounded-md px-2 py-1.5 outline-none focus:ring-1 focus:ring-[var(--primary)]"
          >
            {PAGE_SIZE_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border border-[var(--outline-variant)]/20 overflow-hidden">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-[var(--surface-container-low)]">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();
                  return (
                    <th
                      key={header.id}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                      className={`px-3 py-2.5 text-left text-[10px] font-label font-semibold text-[var(--on-surface-variant)] uppercase tracking-wider whitespace-nowrap border-b border-[var(--outline-variant)]/20 ${canSort ? "cursor-pointer select-none hover:text-[var(--on-surface)]" : ""}`}
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort && (
                          sorted === "asc" ? <ChevronUp size={11} className="text-[var(--primary)]" /> :
                          sorted === "desc" ? <ChevronDown size={11} className="text-[var(--primary)]" /> :
                          <ChevronsUpDown size={11} className="opacity-40" />
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-10 text-center text-sm text-[var(--on-surface-variant)]"
                >
                  No results found.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-[var(--outline-variant)]/10 hover:bg-[var(--surface-container-low)] transition-colors"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2.5 text-[var(--on-surface)]">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs font-label text-[var(--on-surface-variant)]">
        <span>
          {table.getFilteredRowModel().rows.length === 0
            ? "No rows"
            : `${pageIndex * pageSize + 1}–${Math.min((pageIndex + 1) * pageSize, table.getFilteredRowModel().rows.length)} of ${table.getFilteredRowModel().rows.length}`}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="p-1.5 rounded hover:bg-[var(--surface-container-high)] disabled:opacity-30 transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="px-2">
            Page {pageIndex + 1} of {Math.max(1, table.getPageCount())}
          </span>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="p-1.5 rounded hover:bg-[var(--surface-container-high)] disabled:opacity-30 transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
