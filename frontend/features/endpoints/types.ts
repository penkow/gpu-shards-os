export type EndpointSummary = {
  name: string
  container_id: string
  container_name: string
  status: string
  gpu_index: string
  host_port: number
  invocation_count: number
  last_invoked_at: string
  invoke_url: string
  created_at: string
}

export type EndpointDetail = EndpointSummary & {
  code: string
  memory_limit_raw: string
  sm_limit: string
  use_gpu: boolean
  image_used: string
  recent_latencies_ms: number[]
}

export type EndpointCreateRequest = {
  name: string
  code: string
  use_gpu: boolean
  gpu_index: number
  memory: string
  sm_limit: number
  image?: string
}

export type RequestTemplate = {
  id: string
  name: string
  body: string
}

export type TemplatesResponse = {
  templates: RequestTemplate[]
}

export type EndpointsListResponse = {
  endpoints: EndpointSummary[]
}

export type InvokeResult = {
  ok?: boolean
  result?: unknown
  error?: string
  trace?: string
  duration_ms?: number
  gateway_duration_ms: number
  [key: string]: unknown
}
