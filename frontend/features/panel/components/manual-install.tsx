'use client'

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { Check, Copy } from 'lucide-react'
import { InstallChrome } from './install-chrome'

const subscribeNoop = () => () => {}

type Step = {
  title: string
  description: string
  language: string
  code: string
}

function makeSteps(origin: string): Step[] {
  return [
    {
      title: 'Install Docker Engine',
      description:
        "Add Docker's APT repo and install the Engine, CLI, containerd, and the Compose plugin. Add your user to the docker group so you don't need sudo for every command.",
      language: 'bash',
      code: `sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \\
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) \\
signed-by=/etc/apt/keyrings/docker.gpg] \\
https://download.docker.com/linux/ubuntu \\
$(. /etc/os-release && echo "$VERSION_CODENAME") stable" \\
  | sudo tee /etc/apt/sources.list.d/docker.list

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io \\
  docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"   # log out / in for this to take effect`,
    },
    {
      title: 'Install the NVIDIA Container Toolkit',
      description:
        'Required so Docker containers can access the GPU. Assumes the NVIDIA driver is already installed on the host (verify with `nvidia-smi`).',
      language: 'bash',
      code: `curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \\
  | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \\
  | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \\
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

# Sanity check — should print the GPU table
docker run --rm --gpus all nvidia/cuda:12.2.2-base-ubuntu22.04 nvidia-smi`,
    },
    {
      title: 'Install Python 3 and Node.js 20',
      description:
        'The backend is FastAPI (Python 3.10+) and the frontend is Next.js 16 (Node 20+).',
      language: 'bash',
      code: `sudo apt-get install -y python3 python3-venv python3-pip

curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

node -v && python3 --version`,
    },
    {
      title: 'Get the project source',
      description: `Download the source tarball that this very server is serving, and unpack it into a fresh directory.`,
      language: 'bash',
      code: `mkdir -p ~/gpu-shards-os
curl -fsSL ${origin}/source.tar.gz | tar -xz -C ~/gpu-shards-os
cd ~/gpu-shards-os`,
    },
    {
      title: 'Create a Python venv and install backend deps',
      description:
        'Isolate the backend dependencies in a virtualenv so they don\'t collide with the system Python.',
      language: 'bash',
      code: `python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip wheel
pip install -r requirements.txt`,
    },
    {
      title: 'Install frontend deps and build',
      description:
        'Install the Next.js dependencies and produce a production bundle. You can skip the build during dev and use `npm run dev` instead.',
      language: 'bash',
      code: `cd frontend
npm install
npm run build
cd ..`,
    },
    {
      title: 'Build the HAMi libvgpu image',
      description: (
        'Builds `hami-core-demo:latest` — the slim CUDA image with `libvgpu.so` from ' +
        'Project-HAMi baked in at /libvgpu/build/libvgpu.so. This is the default image ' +
        'used when you deploy a container from the panel.'
      ),
      language: 'bash',
      code: `docker build -t hami-core-demo:latest -f Dockerfile .

# Quick sanity test — the cap should report 4096 MiB, not the real card size:
docker run --rm --gpus all \\
  -e LD_PRELOAD=/libvgpu/build/libvgpu.so \\
  -e CUDA_DEVICE_MEMORY_LIMIT=4096m \\
  hami-core-demo:latest nvidia-smi`,
    },
    {
      title: 'Launch the stack',
      description:
        '`run.sh` starts the FastAPI backend on :8000 and the Next.js frontend on :3000, and tears both down on Ctrl-C.',
      language: 'bash',
      code: `source .venv/bin/activate
./run.sh

# Then open the panel:
#   http://localhost:3000`,
    },
  ]
}

export function ManualInstall() {
  const origin = useSyncExternalStore(
    subscribeNoop,
    () => window.location.origin,
    () => 'http://localhost:3000'
  )
  const steps = makeSteps(origin)

  return (
    <InstallChrome breadcrumb="Manual install">
      <main className="relative mx-auto max-w-3xl px-6 pt-16 pb-32 sm:pt-20">
        <header className="mb-12 text-center">
          <span className="border-primary/30 bg-primary/5 text-primary inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
            <span className="bg-primary inline-block size-1.5 rotate-45" />
            Manual install
          </span>
          <h1 className="mt-6 text-[44px] leading-[1.05] font-light tracking-tight text-balance sm:text-[64px]">
            <span className="font-serif">Step by</span>{' '}
            <span className="font-serif italic">step.</span>
          </h1>
          <p className="text-muted-foreground mx-auto mt-6 max-w-xl text-base leading-relaxed text-balance sm:text-lg">
            Eight steps to install GPU Shards OS on Ubuntu by hand. Or just run the{' '}
            <Link
              href="/install"
              className="text-foreground underline underline-offset-4 hover:opacity-80"
            >
              one-line installer
            </Link>{' '}
            — it does all of this for you.
          </p>
        </header>

        <ol className="space-y-10">
          {steps.map((step, idx) => (
            <StepCard key={step.title} index={idx + 1} step={step} />
          ))}
        </ol>

        <div className="text-muted-foreground border-t pt-10 mt-16 text-center text-sm">
          Stuck?{' '}
          <a
            href="https://github.com/Project-HAMi/HAMi-core"
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline underline-offset-4 hover:opacity-80"
          >
            HAMi-core docs
          </a>{' '}
          &nbsp;·&nbsp;{' '}
          <Link
            href="/install"
            className="text-foreground underline underline-offset-4 hover:opacity-80"
          >
            Back to installer
          </Link>
        </div>
      </main>
    </InstallChrome>
  )
}

function StepCard({ index, step }: { index: number; step: Step }) {
  return (
    <li className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-3">
      <div className="border-primary/30 bg-primary/5 text-primary row-span-2 flex size-9 items-center justify-center rounded-full border text-sm font-medium">
        {index}
      </div>
      <div>
        <h2 className="text-foreground text-xl font-medium tracking-tight">
          {step.title}
        </h2>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          {step.description}
        </p>
      </div>
      <div className="col-start-2">
        <CodeBlock code={step.code} />
      </div>
    </li>
  )
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard blocked — ignore */
    }
  }
  return (
    <div className="bg-card group relative overflow-hidden rounded-xl border shadow-sm">
      <button
        type="button"
        onClick={onCopy}
        aria-label={copied ? 'Copied' : 'Copy code'}
        className="text-muted-foreground hover:bg-accent hover:text-foreground absolute top-2 right-2 inline-flex size-8 items-center justify-center rounded-md transition-colors"
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </button>
      <pre className="text-foreground overflow-x-auto px-4 py-3 pr-12 font-mono text-[13px] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  )
}
