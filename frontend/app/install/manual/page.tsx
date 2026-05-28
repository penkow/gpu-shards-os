import { ManualInstall } from '@/features/panel/components/manual-install'

export const metadata = {
  title: 'Manual install — GPU Shards OS',
  description:
    'Step-by-step manual installation of GPU Shards OS on Ubuntu with an NVIDIA GPU.',
}

export default function ManualInstallPage() {
  return <ManualInstall />
}
