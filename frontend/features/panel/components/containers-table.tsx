'use client'

import { useMemo, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import Link from 'next/link'
import { RotateCw, Square, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  DataTableBulkActions,
  DataTableColumnHeader,
  DataTablePagination,
  DataTableToolbar,
} from '@/components/data-table'
import { useBulkContainerAction } from '../mutations'
import type { ManagedContainer } from '../types'
import { ContainerActions } from './container-actions'

function StatusBadge({ status }: { status: string }) {
  const variant: 'default' | 'secondary' | 'destructive' | 'outline' =
    status === 'running'
      ? 'default'
      : status === 'exited'
        ? 'secondary'
        : status === 'restarting'
          ? 'outline'
          : 'outline'
  return (
    <Badge variant={variant} className="capitalize">
      {status}
    </Badge>
  )
}

type Props = {
  containers: ManagedContainer[]
}

export function ContainersTable({ containers }: Props) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [confirmBulk, setConfirmBulk] = useState<null | {
    action: 'stop' | 'restart' | 'remove'
    cids: string[]
  }>(null)

  const stopBulk = useBulkContainerAction('stop')
  const restartBulk = useBulkContainerAction('restart')
  const removeBulk = useBulkContainerAction('remove')

  const columns = useMemo<ColumnDef<ManagedContainer>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && 'indeterminate')
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
            onClick={(e) => e.stopPropagation()}
          />
        ),
        enableSorting: false,
        enableHiding: false,
        size: 32,
      },
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Name" />
        ),
        cell: ({ row }) => (
          <Link
            href={`/containers/${encodeURIComponent(row.original.id)}`}
            className="font-medium hover:underline"
          >
            {row.original.name}
          </Link>
        ),
        filterFn: (row, _id, value: string) => {
          if (!value) return true
          const q = value.toLowerCase()
          return (
            row.original.name.toLowerCase().includes(q) ||
            row.original.image.toLowerCase().includes(q) ||
            row.original.id.toLowerCase().includes(q)
          )
        },
      },
      {
        accessorKey: 'image',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Image" />
        ),
        cell: ({ row }) => (
          <span className="max-w-[280px] truncate text-muted-foreground">
            {row.original.image}
          </span>
        ),
      },
      {
        accessorKey: 'gpu_index',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="GPU" />
        ),
        cell: ({ row }) => <span>{row.original.gpu_index}</span>,
        filterFn: (row, _id, value: string[]) =>
          !value?.length || value.includes(String(row.original.gpu_index)),
      },
      {
        accessorKey: 'memory_limit_raw',
        header: 'Memory',
        cell: ({ row }) => row.original.memory_limit_raw,
        enableSorting: false,
      },
      {
        accessorKey: 'sm_limit',
        header: 'SM',
        cell: ({ row }) => row.original.sm_limit,
        enableSorting: false,
      },
      {
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Status" />
        ),
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
        filterFn: (row, _id, value: string[]) =>
          !value?.length || value.includes(row.original.status),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <ContainerActions container={row.original} openShellInPage />
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
      },
    ],
    []
  )

  const table = useReactTable({
    data: containers,
    columns,
    state: { rowSelection, sorting, columnVisibility },
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getRowId: (row) => row.id,
    initialState: { pagination: { pageSize: 20 } },
  })

  const statusOptions = useMemo(() => {
    const seen = new Set<string>()
    for (const c of containers) seen.add(c.status)
    return Array.from(seen).map((s) => ({ label: s, value: s }))
  }, [containers])

  const gpuOptions = useMemo(() => {
    const seen = new Set<string>()
    for (const c of containers) seen.add(c.gpu_index)
    return Array.from(seen)
      .sort()
      .map((g) => ({ label: `GPU ${g}`, value: g }))
  }, [containers])

  const selectedIds = table
    .getFilteredSelectedRowModel()
    .rows.map((r) => r.original.id)
  const selectedRunning = table
    .getFilteredSelectedRowModel()
    .rows.filter((r) => r.original.status === 'running')
    .map((r) => r.original.id)

  function runBulk() {
    if (!confirmBulk) return
    const fn =
      confirmBulk.action === 'stop'
        ? stopBulk
        : confirmBulk.action === 'restart'
          ? restartBulk
          : removeBulk
    fn.mutate(confirmBulk.cids)
    setRowSelection({})
    setConfirmBulk(null)
  }

  return (
    <div className="space-y-3">
      <DataTableToolbar
        table={table}
        searchKey="name"
        searchPlaceholder="Filter by name, image, or id…"
        filters={[
          { columnId: 'status', title: 'Status', options: statusOptions },
          { columnId: 'gpu_index', title: 'GPU', options: gpuOptions },
        ]}
      />

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  No containers match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <DataTablePagination table={table} />

      <DataTableBulkActions table={table} entityName="container">
        <Button
          size="sm"
          variant="outline"
          disabled={selectedRunning.length === 0}
          onClick={() => setConfirmBulk({ action: 'stop', cids: selectedRunning })}
        >
          <Square /> Stop
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={selectedRunning.length === 0}
          onClick={() => setConfirmBulk({ action: 'restart', cids: selectedRunning })}
        >
          <RotateCw /> Restart
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={selectedIds.length === 0}
          onClick={() => setConfirmBulk({ action: 'remove', cids: selectedIds })}
        >
          <Trash2 /> Remove
        </Button>
      </DataTableBulkActions>

      <ConfirmDialog
        open={confirmBulk !== null}
        onOpenChange={(o) => !o && setConfirmBulk(null)}
        title={
          confirmBulk
            ? `${confirmBulk.action[0].toUpperCase()}${confirmBulk.action.slice(1)} ${confirmBulk.cids.length} container${confirmBulk.cids.length === 1 ? '' : 's'}?`
            : ''
        }
        desc={
          confirmBulk
            ? `Will ${confirmBulk.action} ${confirmBulk.cids.length} container${confirmBulk.cids.length === 1 ? '' : 's'}. This affects only the selected containers.`
            : ''
        }
        confirmText={
          confirmBulk
            ? confirmBulk.action[0].toUpperCase() + confirmBulk.action.slice(1)
            : ''
        }
        destructive={confirmBulk?.action === 'remove'}
        handleConfirm={runBulk}
      />
    </div>
  )
}
