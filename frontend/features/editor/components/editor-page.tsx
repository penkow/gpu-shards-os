'use client'

import { useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import {
  Brain,
  Copy,
  Cpu,
  Database,
  File,
  FileText,
  Image as ImageIcon,
  Loader2,
  Play,
  Upload,
  X,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  editorDeleteFile,
  editorListFiles,
  editorRun,
  editorUploadFile,
  fetchState,
} from '@/features/panel/api'
import type { Gpu } from '@/features/panel/types'
import { LogsView } from '@/features/panel/components/logs-view'

const DEFAULT_PYTHON_CODE = `def handler(event, context):
    """User's lambda function handler.

    Uploaded artifacts are mounted into the container at /workspace/<filename>.
    """

    method = event.get('httpMethod', 'GET')
    body = event.get('body', {})
    query_params = event.get('queryStringParameters', {})

    return {
        "statusCode": 200,
        "body": {
            "message": "Hello from user function!",
            "method": method,
            "requestId": context.get('requestId', 'unknown'),
            "query": query_params,
            "echo": body,
        },
    }
`

type UploadedArtifact = {
  id: string
  name: string
  size: number
  type: string
  uploadedAt: Date
  isUploading: boolean
  uploadProgress: number
}

function inferType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return ext
}

export function EditorPage() {
  const [code, setCode] = useState(DEFAULT_PYTHON_CODE)
  const [theme] = useState('vs-dark')
  const [isLoading, setIsLoading] = useState(true)
  const [uploadedArtifacts, setUploadedArtifacts] = useState<UploadedArtifact[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [useGpu, setUseGpu] = useState(false)
  const [gpus, setGpus] = useState<Gpu[]>([])
  const [gpuIndex, setGpuIndex] = useState<number>(0)
  const [containerId, setContainerId] = useState<string>('')
  const [containerName, setContainerName] = useState<string>('')
  const editorRef = useRef<any>(null)
  const artifactInputRef = useRef<HTMLInputElement>(null)

  // Hydrate previously-uploaded files + the GPU list on mount.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { files } = await editorListFiles()
        if (cancelled) return
        setUploadedArtifacts(
          files.map((f) => ({
            id: f.name,
            name: f.name,
            size: f.size,
            type: inferType(f.name),
            uploadedAt: new Date(f.uploaded_at),
            isUploading: false,
            uploadProgress: 100,
          })),
        )
      } catch (e: any) {
        console.warn('editor: failed to list files', e?.message ?? e)
      }
    })()
    ;(async () => {
      try {
        const state = await fetchState()
        if (cancelled) return
        setGpus(state.gpus)
        if (state.gpus.length > 0) setGpuIndex(state.gpus[0].index)
      } catch (e: any) {
        console.warn('editor: failed to fetch GPU list', e?.message ?? e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor
    setIsLoading(false)

    editor.updateOptions({
      fontSize: 12,
      minimap: { enabled: true },
      wordWrap: 'on',
      automaticLayout: true,
      scrollBeyondLastLine: false,
      roundedSelection: false,
      padding: { top: 10 },
    })

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyR, () => {
      void handleRun()
    })
  }

  const handleRun = async () => {
    if (!editorRef.current) return
    const currentCode = editorRef.current.getValue()

    setIsRunning(true)
    setContainerId('')
    setContainerName('')
    toast.info(useGpu ? 'Starting GPU run…' : 'Starting CPU run…')

    try {
      const res = await editorRun({ code: currentCode, use_gpu: useGpu, gpu_index: gpuIndex })
      setContainerId(res.container_id)
      setContainerName(res.container_name)
      toast.success(`Run started: ${res.container_name}`)
    } catch (e: any) {
      toast.error('Failed to start run', { description: e?.message ?? String(e) })
    } finally {
      setIsRunning(false)
    }
  }

  const handleArtifactUpload = () => artifactInputRef.current?.click()

  const enqueueArtifactFiles = (files: FileList) => {
    Array.from(files).forEach(async (file) => {
      const id = file.name
      const placeholder: UploadedArtifact = {
        id,
        name: file.name,
        size: file.size,
        type: inferType(file.name),
        uploadedAt: new Date(),
        isUploading: true,
        uploadProgress: 0,
      }
      setUploadedArtifacts((prev) => {
        const without = prev.filter((a) => a.id !== id)
        return [...without, placeholder]
      })
      toast.info(`Uploading ${file.name}…`)

      try {
        const saved = await editorUploadFile(file, (pct) => {
          setUploadedArtifacts((prev) =>
            prev.map((a) => (a.id === id ? { ...a, uploadProgress: pct } : a)),
          )
        })
        setUploadedArtifacts((prev) =>
          prev.map((a) =>
            a.id === id
              ? {
                  ...a,
                  isUploading: false,
                  uploadProgress: 100,
                  size: saved.size,
                  uploadedAt: new Date(saved.uploaded_at),
                }
              : a,
          ),
        )
        toast.success(`${file.name} uploaded`)
      } catch (e: any) {
        toast.error(`Failed to upload ${file.name}`, { description: e?.message ?? String(e) })
        setUploadedArtifacts((prev) => prev.filter((a) => a.id !== id))
      }
    })
  }

  const handleArtifactFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files) return
    enqueueArtifactFiles(files)
    event.target.value = ''
  }

  const handleArtifactDrop = (e: React.DragEvent) => {
    e.preventDefault()
    enqueueArtifactFiles(e.dataTransfer.files)
  }

  const removeArtifact = async (name: string) => {
    try {
      await editorDeleteFile(name)
      setUploadedArtifacts((prev) => prev.filter((a) => a.id !== name))
      toast.success('Artifact removed')
    } catch (e: any) {
      toast.error('Failed to remove artifact', { description: e?.message ?? String(e) })
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getFileIcon = (filename: string, type: string) => {
    const ext = filename.split('.').pop()?.toLowerCase()
    if (['pkl', 'pickle', 'joblib', 'h5', 'hdf5', 'pt', 'pth', 'onnx', 'pb'].includes(ext || '')) {
      return <Brain className="h-4 w-4" />
    }
    if (['csv', 'json', 'parquet', 'feather', 'xlsx', 'xls'].includes(ext || '')) {
      return <Database className="h-4 w-4" />
    }
    if (type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg'].includes(ext || '')) {
      return <ImageIcon className="h-4 w-4" />
    }
    if (['txt', 'md', 'yaml', 'yml', 'toml', 'cfg', 'conf'].includes(ext || '')) {
      return <FileText className="h-4 w-4" />
    }
    return <File className="h-4 w-4" />
  }

  const insertArtifactReference = (filename: string) => {
    if (!editorRef.current) return
    const editor = editorRef.current
    const position = editor.getPosition()
    const range = {
      startLineNumber: position.lineNumber,
      startColumn: position.column,
      endLineNumber: position.lineNumber,
      endColumn: position.column,
    }
    const referenceText = `# Mounted at /workspace/${filename}\nartifact_path = "/workspace/${filename}"\n`
    editor.executeEdits('insert-artifact-reference', [{ range, text: referenceText }])
    toast.success(`Reference to ${filename} inserted`)
  }

  return (
    <div className="flex h-svh gap-4 overflow-hidden p-4">
      {/* Left column: toolbar + editor (3/4) + terminal (1/4) */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex w-full flex-wrap items-center gap-2 rounded-md border bg-background px-2 py-1.5">
          <Button
            size="sm"
            onClick={handleRun}
            disabled={isRunning}
            className="flex items-center gap-1.5"
          >
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            <span>{isRunning ? 'Starting…' : 'Run'}</span>
          </Button>

          <Separator orientation="vertical" className="mx-1 h-6" />

          <div
            className="flex items-center gap-2 px-1"
            title="Toggle GPU access for the next Run"
          >
            <Label
              htmlFor="gpu-switch"
              className={`flex cursor-pointer items-center gap-1 text-sm ${useGpu ? 'text-muted-foreground' : ''}`}
            >
              <Cpu className="h-4 w-4" />
              CPU
            </Label>
            <Switch
              id="gpu-switch"
              checked={useGpu}
              onCheckedChange={setUseGpu}
            />
            <Label
              htmlFor="gpu-switch"
              className={`flex cursor-pointer items-center gap-1 text-sm ${useGpu ? '' : 'text-muted-foreground'}`}
            >
              <Zap className="h-4 w-4" />
              GPU
            </Label>
          </div>

          <Separator orientation="vertical" className="mx-1 h-6" />

          <Select
            value={String(gpuIndex)}
            onValueChange={(v) => setGpuIndex(Number(v))}
            disabled={!useGpu || gpus.length === 0}
          >
            <SelectTrigger size="sm" className="h-8 w-48">
              <SelectValue placeholder={gpus.length === 0 ? 'No GPUs detected' : 'Select GPU'} />
            </SelectTrigger>
            <SelectContent>
              {gpus.map((g) => (
                <SelectItem key={g.index} value={String(g.index)}>
                  GPU {g.index} · {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Editor (top) + Terminal (bottom), vertically resizable */}
        <ResizablePanelGroup
          orientation="vertical"
          className="min-h-0 flex-1"
        >
          <ResizablePanel defaultSize={75} minSize={20}>
            <div className="relative h-full overflow-hidden rounded-lg border">
              {isLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-100 dark:bg-gray-900">
                  <div className="text-center">
                    <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-b-2 border-gray-900 dark:border-white"></div>
                    <p className="text-gray-600 dark:text-gray-400">Loading editor…</p>
                  </div>
                </div>
              )}

              <Editor
                height="100%"
                language="python"
                theme={theme}
                value={code}
                onChange={(value) => setCode(value || '')}
                onMount={handleEditorDidMount}
                options={{
                  selectOnLineNumbers: true,
                  automaticLayout: true,
                  cursorBlinking: 'blink',
                  cursorSmoothCaretAnimation: 'on',
                  smoothScrolling: true,
                  mouseWheelZoom: true,
                }}
              />
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel defaultSize={25} minSize={10}>
            <div className="flex h-full flex-col overflow-hidden rounded-lg border bg-gray-50 dark:bg-gray-900/50">
              <div className="flex items-center border-b px-3 py-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <FileText className="h-4 w-4" />
                  Run Logs
                  {containerName && (
                    <span className="font-mono text-xs font-normal text-gray-600 dark:text-gray-400">
                      ({containerName})
                    </span>
                  )}
                </h3>
              </div>
              <div className="flex min-h-0 flex-1 flex-col p-2">
                {containerId ? (
                  <LogsView
                    cid={containerId}
                    name={containerName}
                    mode="live"
                    showHeader={false}
                    className="h-full"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-gray-500 dark:text-gray-400">
                    Click <span className="mx-1 font-medium">Run</span> to start a container; logs stream here.
                  </div>
                )}
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Right sidebar: full height */}
      <div className="flex h-full w-80 shrink-0 flex-col overflow-hidden rounded-lg border bg-gray-50 dark:bg-gray-900/50">
          <div className="border-b p-4">
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <Database className="h-5 w-5" />
              Workspace Files
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Mounted at <code className="font-mono">/workspace</code> during Run
            </p>
          </div>

          <div className="p-4">
            <div
              className="cursor-pointer rounded-lg border-2 border-dashed border-gray-300 p-6 text-center transition-colors hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500"
              onClick={handleArtifactUpload}
              onDragOver={(e) => {
                e.preventDefault()
                e.currentTarget.classList.add('border-blue-400', 'bg-blue-50', 'dark:bg-blue-900/20')
              }}
              onDragLeave={(e) => {
                e.preventDefault()
                e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50', 'dark:bg-blue-900/20')
              }}
              onDrop={(e) => {
                e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50', 'dark:bg-blue-900/20')
                handleArtifactDrop(e)
              }}
            >
              <Upload className="mx-auto mb-3 h-8 w-8 text-gray-400" />
              <p className="mb-2 text-sm text-gray-600 dark:text-gray-400">Drop files here</p>
              <p className="mb-3 text-xs text-gray-500 dark:text-gray-500">
                Models, datasets, configs, etc.
              </p>
              <Button variant="outline" size="sm">
                Browse Files
              </Button>
            </div>

            {uploadedArtifacts.some((a) => a.isUploading) && (
              <div className="mt-3 text-center">
                <p className="flex items-center justify-center gap-2 text-xs text-blue-600 dark:text-blue-400">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Uploading {uploadedArtifacts.filter((a) => a.isUploading).length} file(s)…
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="border-b px-4 py-2">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Uploaded Files ({uploadedArtifacts.length})
              </h4>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {uploadedArtifacts.length === 0 ? (
                <div className="py-8 text-center text-gray-500 dark:text-gray-400">
                  <Database className="mx-auto mb-2 h-8 w-8 opacity-50" />
                  <p className="text-sm">No files yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {uploadedArtifacts.map((artifact) => (
                    <div
                      key={artifact.id}
                      className="group flex flex-col gap-2 rounded-lg border bg-white p-2 transition-shadow hover:shadow-sm dark:bg-gray-800"
                    >
                      <div className="flex items-center gap-2">
                        <div className="shrink-0 text-gray-500">
                          {artifact.isUploading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            getFileIcon(artifact.name, artifact.type)
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium" title={artifact.name}>
                            {artifact.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatFileSize(artifact.size)}
                            {artifact.isUploading && (
                              <span className="ml-2">({artifact.uploadProgress}%)</span>
                            )}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          {!artifact.isUploading && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => insertArtifactReference(artifact.name)}
                                title="Insert reference in code"
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                                onClick={() => void removeArtifact(artifact.id)}
                                title="Remove artifact"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {artifact.isUploading && (
                        <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                          <div
                            className="h-1.5 rounded-full bg-blue-500 transition-all duration-300 ease-out"
                            style={{ width: `${artifact.uploadProgress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
      </div>

      <input
        ref={artifactInputRef}
        type="file"
        onChange={handleArtifactFileUpload}
        className="hidden"
        multiple
      />
    </div>
  )
}
