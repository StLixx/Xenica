import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from './client';
import catalog from './design-catalog.json';

export const designCatalog = catalog;
export const useVersions = () => useQuery({queryKey:['development-versions'],queryFn:async()=>unwrap(await api.GET('/api/development/versions'))});
export const startVersion = async (id:string) => unwrap(await api.POST('/api/development/versions/{id}/start',{params:{path:{id}}}));
export const useRuntime = (id:string|null) => useQuery({queryKey:['development-runtime',id],queryFn:async()=>unwrap(await api.GET('/api/development/runtimes/{id}',{params:{path:{id:id ?? ''}}})),enabled:!!id,refetchInterval:2000});
export const bridgeRuntime = async(id:string)=>unwrap(await api.POST('/api/development/runtimes/{id}/bridge',{params:{path:{id}}}));
