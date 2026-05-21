'use client'

import { useState, useRef, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import {
  Play,
  Download,
  Upload,
  Copy,
  RotateCcw,
  File,
  X,
  Database,
  Brain,
  Image as ImageIcon,
  FileText,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

const DEFAULT_PYTHON_CODE = `def handler(event, context):
    """
    User's lambda function handler

    Args:
        event: Dictionary containing request data (headers, body, query params, etc.)
        context: Dictionary containing execution context info

    Returns:
        Dictionary with statusCode, body, and optional headers
    """

    # Extract request information
    method = event.get('httpMethod', 'GET')
    path = event.get('path', '/')
    body = event.get('body', {})
    query_params = event.get('queryStringParameters', {})

    # User's custom logic goes here
    if method == 'GET':
        return {
            "statusCode": 200,
            "body": {
                "message": "Hello from user function!",
                "method": method,
                "timestamp": context.get('requestId', 'unknown'),
                "query": query_params
            }
        }

    elif method == 'POST':
        # Process POST data
        return {
            "statusCode": 200,
            "body": {
                "message": "POST request processed",
                "received_data": body,
                "processing_result": f"Processed {len(str(body))} characters"
            }
        }

    else:
        return {
            "statusCode": 405,
            "body": {
                "error": f"Method {method} not allowed"
            }
        }
`

interface UploadedArtifact {
  id: string
  name: string
  size: number
  type: string
  uploadedAt: Date
  file: File
  uploadProgress?: number
  isUploading?: boolean
  uploadUrl?: string
}

export function EditorPage() {
  const [code, setCode] = useState(DEFAULT_PYTHON_CODE)
  const [theme] = useState('vs-dark')
  const [isLoading, setIsLoading] = useState(true)
  const [uploadedArtifacts, setUploadedArtifacts] = useState<UploadedArtifact[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [logs, setLogs] = useState<string>('')
  const [showLogs, setShowLogs] = useState(false)
  const [podName, setPodName] = useState<string>('')
  const [isPollingLogs, setIsPollingLogs] = useState(false)
  const editorRef = useRef<any>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const artifactInputRef = useRef<HTMLInputElement>(null)
  const pollingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current)
      }
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

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleDownload()
    })

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyR, () => {
      handleRun()
    })
  }

  const fetchPodLogs = async (targetPodName: string) => {
    try {
      const response = await fetch(
        `/api/logs?podName=${encodeURIComponent(targetPodName)}&namespace=default&tailLines=100`
      )
      const result = await response.json()

      if (result.success) {
        const logContent = result.logs || 'No logs available yet...'
        const podStatus = result.podStatus?.phase || 'Unknown'
        const runtimeSeconds = result.runtimeSeconds || 0

        setLogs(
          `📋 Pod: ${targetPodName}\n🔄 Status: ${podStatus}\n⏱️  Runtime: ${runtimeSeconds}s\n\n--- Pod Logs ---\n${logContent}`
        )

        if (podStatus === 'Running' || podStatus === 'Pending') {
          pollingTimeoutRef.current = setTimeout(() => fetchPodLogs(targetPodName), 2000)
        } else {
          setIsPollingLogs(false)
          toast.info(`Pod ${podStatus.toLowerCase()}`, {
            description: 'Logs fetching stopped',
          })
        }
      } else {
        setLogs(`❌ Failed to fetch pod logs\n\nError: ${result.error}`)
        setIsPollingLogs(false)
      }
    } catch (error: any) {
      setLogs(`❌ Failed to fetch pod logs\n\nError: ${error.message}`)
      setIsPollingLogs(false)
    }
  }

  const findAndFetchPodLogs = async (deploymentName: string) => {
    try {
      setLogs(`🔍 Searching for pods with deployment: ${deploymentName}...`)

      const response = await fetch(
        `/api/logs?jobName=${encodeURIComponent(deploymentName)}&namespace=default&tailLines=100`
      )
      const result = await response.json()

      if (result.success && result.podName) {
        setPodName(result.podName)
        const logContent = result.logs || 'No logs available yet...'
        const podStatus = result.podStatus?.phase || 'Unknown'
        const runtimeSeconds = result.runtimeSeconds || 0

        setLogs(
          `✅ Found pod: ${result.podName}\n📋 Pod: ${result.podName}\n🔄 Status: ${podStatus}\n⏱️  Runtime: ${runtimeSeconds}s\n\n--- Pod Logs ---\n${logContent}`
        )

        toast.success(`Found pod: ${result.podName}`, {
          description: `Status: ${podStatus}`,
        })

        if (podStatus === 'Running' || podStatus === 'Pending') {
          pollingTimeoutRef.current = setTimeout(() => fetchPodLogs(result.podName), 2000)
        } else {
          setIsPollingLogs(false)
          toast.info(`Pod ${podStatus.toLowerCase()}`, {
            description: 'Logs fetching stopped',
          })
        }
      } else {
        setLogs(
          `❌ No pods found for deployment: ${deploymentName}\n\nError: ${result.error || 'Unknown error'}\n\nThis might be because:\n1. The deployment is still creating pods (wait a few seconds)\n2. Deployment failed to create pods\n3. Pods have unexpected labels\n\nTry refreshing in a few seconds or check your cluster status.`
        )
        setIsPollingLogs(false)

        toast.error('No pods found', {
          description: 'Try refreshing in a few seconds',
        })
      }
    } catch (error: any) {
      setLogs(
        `❌ Failed to find pod\n\nError: ${error.message}\n\nPlease check:\n1. Deployment exists\n2. Pods are created\n3. Cluster connectivity\n4. API endpoint is accessible`
      )
      setIsPollingLogs(false)
    }
  }

  const handleRun = async () => {
    if (!editorRef.current) return

    const currentCode = editorRef.current.getValue()
    setIsRunning(true)
    setLogs('')
    setShowLogs(true)
    setPodName('')
    setIsPollingLogs(false)

    toast.info('Deploying lambda function...', {
      description: 'Sending code to lambda API...',
    })

    try {
      const response = await fetch('/api/lambda', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userCode: currentCode,
        }),
      })

      const result = await response.json()

      if (result.success) {
        setLogs(
          `✅ Lambda deployment successful!\n\nOutput:\n${result.output.stdout || result.output}\n\n🔍 Searching for pod...`
        )
        toast.success('Lambda deployed successfully!', {
          description: 'Fetching pod logs...',
        })

        setTimeout(async () => {
          setIsPollingLogs(true)

          let retries = 0
          const maxRetries = 5
          const retryDelay = 3000

          const tryFindPod = async () => {
            try {
              await findAndFetchPodLogs('lambda-test')
            } catch (error) {
              retries++
              if (retries < maxRetries) {
                setLogs(
                  `🔄 Attempt ${retries}/${maxRetries}: Pod not found yet, retrying in ${retryDelay / 1000}s...`
                )
                setTimeout(tryFindPod, retryDelay)
              } else {
                setLogs(
                  `❌ Failed to find pod after ${maxRetries} attempts.\n\nThe deployment might have failed or the pod creation is taking longer than expected.\n\nPlease check your cluster status or try deploying again.`
                )
                setIsPollingLogs(false)
              }
            }
          }

          await tryFindPod()
        }, 3000)
      } else {
        setLogs(
          `❌ Lambda deployment failed!\n\nError: ${result.error}\n\nDetails:\n${result.details || 'No additional details'}`
        )
        toast.error('Lambda deployment failed', {
          description: result.error,
        })
      }
    } catch (error: any) {
      setLogs(
        `❌ Failed to call lambda API!\n\nError: ${error.message}\n\nPlease check your connection and try again.`
      )
      toast.error('Failed to deploy lambda', {
        description: 'Could not connect to API',
      })
    } finally {
      setIsRunning(false)
    }
  }

  const handleDownload = () => {
    if (!editorRef.current) return

    const currentCode = editorRef.current.getValue()
    const blob = new Blob([currentCode], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'code.py'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    toast.success('File downloaded successfully!')
  }

  const handleUpload = () => {
    fileInputRef.current?.click()
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      setCode(content)
      toast.success('File uploaded successfully!')
    }
    reader.readAsText(file)

    event.target.value = ''
  }

  const handleCopy = async () => {
    if (!editorRef.current) return

    const currentCode = editorRef.current.getValue()
    try {
      await navigator.clipboard.writeText(currentCode)
      toast.success('Code copied to clipboard!')
    } catch {
      toast.error('Failed to copy code to clipboard')
    }
  }

  const handleReset = () => {
    setCode(DEFAULT_PYTHON_CODE)
    toast.success('Code reset to default')
  }

  const uploadFileWithProgress = async (file: File, artifactId: string) => {
    try {
      const response = await fetch('/api/files', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: file.name,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get presigned URL')
      }

      const { url: presignedUrl } = await response.json()

      return new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100)
            setUploadedArtifacts((prev) =>
              prev.map((artifact) =>
                artifact.id === artifactId ? { ...artifact, uploadProgress: progress } : artifact
              )
            )
          }
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setUploadedArtifacts((prev) =>
              prev.map((artifact) =>
                artifact.id === artifactId
                  ? {
                      ...artifact,
                      isUploading: false,
                      uploadProgress: 100,
                      uploadUrl: presignedUrl,
                    }
                  : artifact
              )
            )
            resolve()
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`))
          }
        }

        xhr.onerror = () => {
          reject(new Error('Upload failed'))
        }

        xhr.open('PUT', presignedUrl)
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
        xhr.send(file)
      })
    } catch (error) {
      setUploadedArtifacts((prev) =>
        prev.map((artifact) =>
          artifact.id === artifactId
            ? { ...artifact, isUploading: false, uploadProgress: 0 }
            : artifact
        )
      )
      throw error
    }
  }

  const handleArtifactUpload = () => {
    artifactInputRef.current?.click()
  }

  const enqueueArtifactFiles = (files: FileList) => {
    Array.from(files).forEach(async (file) => {
      const artifactId = Date.now().toString() + Math.random().toString(36).slice(2, 11)
      const artifact: UploadedArtifact = {
        id: artifactId,
        name: file.name,
        size: file.size,
        type: file.type || 'unknown',
        uploadedAt: new Date(),
        file: file,
        uploadProgress: 0,
        isUploading: true,
      }

      setUploadedArtifacts((prev) => [...prev, artifact])
      toast.info(`Starting upload: ${file.name}`)

      try {
        await uploadFileWithProgress(file, artifactId)
        toast.success(`${file.name} uploaded successfully!`)
      } catch (error) {
        console.error('Upload failed:', error)
        toast.error(`Failed to upload ${file.name}`)
        setUploadedArtifacts((prev) => prev.filter((a) => a.id !== artifactId))
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

  const removeArtifact = (id: string) => {
    setUploadedArtifacts((prev) => prev.filter((artifact) => artifact.id !== id))
    toast.success('Artifact removed')
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
    if (
      type.startsWith('image/') ||
      ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg'].includes(ext || '')
    ) {
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

    const referenceText = `# Load artifact: ${filename}\n# artifact_path = "/tmp/artifacts/${filename}"\n`

    editor.executeEdits('insert-artifact-reference', [
      {
        range: range,
        text: referenceText,
      },
    ])

    toast.success(`Reference to ${filename} inserted`)
  }

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex flex-col space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleRun} disabled={isRunning} className="flex items-center space-x-2">
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            <span>{isRunning ? 'Deploying...' : 'Run'}</span>
          </Button>

          <Button
            variant="outline"
            onClick={handleDownload}
            className="flex items-center space-x-2"
          >
            <Download className="h-4 w-4" />
            <span>Download</span>
          </Button>

          <Button variant="outline" onClick={handleUpload} className="flex items-center space-x-2">
            <Upload className="h-4 w-4" />
            <span>Upload</span>
          </Button>

          <Button variant="outline" onClick={handleCopy} className="flex items-center space-x-2">
            <Copy className="h-4 w-4" />
            <span>Copy</span>
          </Button>

          <Button variant="outline" onClick={handleReset} className="flex items-center space-x-2">
            <RotateCcw className="h-4 w-4" />
            <span>Reset</span>
          </Button>
        </div>
      </div>

      <div className="flex gap-6" style={{ height: '600px' }}>
        <div className="flex-1 overflow-hidden rounded-lg border">
          {isLoading && (
            <div className="flex h-full items-center justify-center bg-gray-100 dark:bg-gray-900">
              <div className="text-center">
                <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-b-2 border-gray-900 dark:border-white"></div>
                <p className="text-gray-600 dark:text-gray-400">Loading editor...</p>
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

        <div className="flex w-80 flex-col rounded-lg border bg-gray-50 dark:bg-gray-900/50">
          <div className="border-b p-4">
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <Database className="h-5 w-5" />
              ML Artifacts
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Upload models, datasets, and other ML files
            </p>
          </div>

          <div className="p-4">
            <div
              className="cursor-pointer rounded-lg border-2 border-dashed border-gray-300 p-6 text-center transition-colors hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500"
              onClick={handleArtifactUpload}
              onDragOver={(e) => {
                e.preventDefault()
                e.currentTarget.classList.add(
                  'border-blue-400',
                  'bg-blue-50',
                  'dark:bg-blue-900/20'
                )
              }}
              onDragLeave={(e) => {
                e.preventDefault()
                e.currentTarget.classList.remove(
                  'border-blue-400',
                  'bg-blue-50',
                  'dark:bg-blue-900/20'
                )
              }}
              onDrop={(e) => {
                e.currentTarget.classList.remove(
                  'border-blue-400',
                  'bg-blue-50',
                  'dark:bg-blue-900/20'
                )
                handleArtifactDrop(e)
              }}
            >
              <Upload className="mx-auto mb-3 h-8 w-8 text-gray-400" />
              <p className="mb-2 text-sm text-gray-600 dark:text-gray-400">
                Drop ML artifacts here
              </p>
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
                  Uploading {uploadedArtifacts.filter((a) => a.isUploading).length} file(s)...
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
                  <p className="text-sm">No artifacts uploaded yet</p>
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
                            {artifact.isUploading && artifact.uploadProgress !== undefined && (
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
                                onClick={() => removeArtifact(artifact.id)}
                                title="Remove artifact"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {artifact.isUploading && artifact.uploadProgress !== undefined && (
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

          <div className="border-t bg-gray-100 p-3 dark:bg-gray-800/50">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Supported: Models (.pkl, .h5, .pt), Data (.csv, .json), Images, etc.
            </p>
            {uploadedArtifacts.some((a) => a.isUploading) && (
              <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                Files are being uploaded to cloud storage...
              </p>
            )}
          </div>
        </div>
      </div>

      {showLogs && (
        <div className="rounded-lg border bg-gray-50 dark:bg-gray-900/50">
          <div className="flex items-center justify-between border-b p-4">
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              {isRunning || isPollingLogs ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <FileText className="h-5 w-5" />
              )}
              Lambda Pod Logs
              {podName && (
                <span className="text-sm font-normal text-gray-600 dark:text-gray-400">
                  ({podName})
                </span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              {isPollingLogs && (
                <span className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500"></div>
                  Live
                </span>
              )}
              {podName && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => podName && fetchPodLogs(podName)}
                    disabled={isPollingLogs}
                    className="text-xs"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Refresh
                  </Button>
                  {isPollingLogs && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsPollingLogs(false)
                        if (pollingTimeoutRef.current) {
                          clearTimeout(pollingTimeoutRef.current)
                        }
                        toast.info('Stopped live log updates')
                      }}
                      className="text-xs text-orange-600 hover:text-orange-700"
                    >
                      Stop Live
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        const response = await fetch('/api/helm', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({
                            command: 'kubectl get pods --namespace=default',
                          }),
                        })
                        const result = await response.json()
                        if (result.success) {
                          setLogs(
                            `🔍 All pods in default namespace:\n\n${result.output}\n\n--- Use the exact pod name from above to manually check logs ---`
                          )
                        } else {
                          setLogs(`❌ Failed to list pods: ${result.error}`)
                        }
                      } catch (error: any) {
                        setLogs(`❌ Failed to list pods: ${error.message}`)
                      }
                    }}
                    className="text-xs text-blue-600 hover:text-blue-700"
                  >
                    Debug
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowLogs(false)
                  setIsPollingLogs(false)
                  if (pollingTimeoutRef.current) {
                    clearTimeout(pollingTimeoutRef.current)
                  }
                }}
                className="text-xs"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <div className="p-4">
            <div className="max-h-96 overflow-x-auto overflow-y-auto rounded bg-black p-4 text-green-400">
              <pre className="font-mono text-sm whitespace-pre-wrap">
                {logs || 'Waiting for deployment logs...'}
              </pre>
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileUpload}
        className="hidden"
        accept=".py"
      />

      <input
        ref={artifactInputRef}
        type="file"
        onChange={handleArtifactFileUpload}
        className="hidden"
        multiple
        accept=".pkl,.pickle,.joblib,.h5,.hdf5,.pt,.pth,.onnx,.pb,.csv,.json,.parquet,.feather,.xlsx,.xls,.jpg,.jpeg,.png,.gif,.bmp,.svg,.txt,.md,.yaml,.yml,.toml,.cfg,.conf"
      />
    </div>
  )
}
