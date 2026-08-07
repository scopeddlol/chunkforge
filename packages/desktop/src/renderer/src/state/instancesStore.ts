import { create } from 'zustand'
import type { InstanceSummary } from '@shared/types'
import { api } from '../api'

interface InstancesState {
  instances: InstanceSummary[]
  loaded: boolean
  refresh: () => Promise<void>
  applyStatus: (instanceId: string, status: InstanceSummary['status']) => void
}

export const useInstancesStore = create<InstancesState>((set) => ({
  instances: [],
  loaded: false,
  refresh: async () => {
    const instances = await api().servers.list()
    set({ instances, loaded: true })
  },
  applyStatus: (instanceId, status) =>
    set((prev) => ({
      instances: prev.instances.map((instance) =>
        instance.id === instanceId ? { ...instance, status } : instance
      )
    }))
}))
