export type Gpu = {
  index: number
  name: string
  memory_total_mb: number
  memory_used_mb: number
  utilization_pct: number
  allocated_mb: number
  allocated_sm_pct: number
}

export type ManagedContainer = {
  id: string
  name: string
  status: string
  image: string
  gpu_index: string
  memory_limit_mb: number
  memory_limit_raw: string
  sm_limit: string
}

export type ContainerDetail = ManagedContainer & {
  env: Record<string, string>
  command: string[]
  created_at: string
  started_at: string
  finished_at: string
  exit_code: number
  restart_count: number
  restart_policy: string
  endpoint_name: string
}

export type PanelState = {
  connected: boolean
  docker_target: string
  error: string
  gpus: Gpu[]
  containers: ManagedContainer[]
  images: string[]
}

export type DeployRequest = {
  image: string
  name?: string
  gpu_index: number
  memory: string
  sm_limit: number
  command?: string
}

export type DeployResponse = {
  id: string
  name: string
}

export type EditorRunRequest = {
  code: string
  use_gpu: boolean
  gpu_index?: number
}

export type EditorRunResponse = {
  run_id: string
  container_id: string
  container_name: string
}

export type EditorFile = {
  name: string
  size: number
  uploaded_at: string
}

export type EditorFilesResponse = {
  files: EditorFile[]
}
