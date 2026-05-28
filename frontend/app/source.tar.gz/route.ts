import { spawn } from 'node:child_process'
import { Readable } from 'node:stream'
import path from 'node:path'

export const dynamic = 'force-dynamic'

const EXCLUDES = [
  '.git',
  '.claude',
  'node_modules',
  '.next',
  '.venv',
  '__pycache__',
  '.DS_Store',
  'tsconfig.tsbuildinfo',
  'CLAUDE.md',
]

export async function GET() {
  const projectRoot = path.resolve(process.cwd(), '..')

  const excludeArgs = EXCLUDES.flatMap((p) => ['--exclude', p])
  const args = ['-czf', '-', ...excludeArgs, '-C', projectRoot, '.']

  const child = spawn('tar', args, { stdio: ['ignore', 'pipe', 'pipe'] })

  let stderrBuf = ''
  child.stderr.on('data', (chunk) => {
    stderrBuf += chunk.toString()
  })
  child.on('error', (err) => {
    // Surface spawn errors as stream errors for the consumer.
    child.stdout.destroy(err)
  })
  child.on('close', (code) => {
    if (code !== 0 && stderrBuf) {
      console.error('[source.tar.gz] tar exited %d: %s', code, stderrBuf.trim())
    }
  })

  const stream = Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Disposition': 'attachment; filename="gpu-shards-os.tar.gz"',
      'Cache-Control': 'no-store',
    },
  })
}
