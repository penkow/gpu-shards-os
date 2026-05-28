import { InstallLanding } from '@/features/panel/components/install-landing'

export const metadata = {
  title: 'Install — GPU Shards OS',
  description:
    'Install GPU Shards OS on Ubuntu with NVIDIA GPU. One-line installer sets up Docker, the NVIDIA Container Toolkit, and the backend.',
}

export default function InstallPage() {
  return <InstallLanding />
}
