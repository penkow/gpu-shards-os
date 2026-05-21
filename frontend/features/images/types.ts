export type BuildImageRequest = {
  tag: string
  dockerfile: string
}

export type BuildStatus = {
  build_id: string
  tag: string
  status: 'running' | 'succeeded' | 'failed'
  started_at: string
  finished_at: string
  image_id: string
  error: string
}

export type BuildsListResponse = {
  builds: BuildStatus[]
}

export type ImageInfo = {
  id: string
  tags: string[]
  size_bytes: number
  created_at: string
  architecture: string
  used_by: string[]
}

export type ImagesResponse = {
  images: ImageInfo[]
}

export type ImageInspectResponse = {
  data: Record<string, unknown>
}
