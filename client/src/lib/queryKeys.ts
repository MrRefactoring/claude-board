/** Central query-key registry — every useQuery/setQueryData goes through these. */
export const queryKeys = {
  projects: ['projects'] as const,
  /** All per-project task lists share the 'tasks' prefix so realtime patches can target them all. */
  tasks: (projectId: number) => ['tasks', projectId] as const,
  templates: (projectId: number) => ['templates', projectId] as const,
  roles: (projectId: number) => ['roles', projectId] as const,
  snippets: (projectId: number) => ['snippets', projectId] as const,
  webhooks: (projectId: number) => ['webhooks', projectId] as const,
};
