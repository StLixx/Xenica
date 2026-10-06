/**
 * 前端模块边界。破坏这些规则 = CI 失败。
 *   ui/     基础组件：不知道视图、外壳、后端的存在
 *   api/    唯一和后端说话的地方
 *   shell/  工作台外壳：只通过注册表认识视图
 *   views/  每个视图一个目录：彼此不准 import；只能用 shell/api.ts
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    {
      name: 'ui-is-a-leaf',
      comment: 'ui/ 只能依赖第三方库和 ui/ 自己',
      severity: 'error',
      from: { path: '^src/ui' },
      to: { path: '^src/(api|shell|views|app)' },
    },
    {
      name: 'only-api-talks-to-backend',
      severity: 'error',
      from: { pathNot: '^src/api' },
      to: { path: 'openapi-fetch' },
    },
    {
      name: 'views-use-public-shell-api-only',
      severity: 'error',
      from: { path: '^src/views' },
      to: { path: '^src/shell', pathNot: '^src/shell/api\\.ts$' },
    },
    {
      name: 'views-are-independent',
      comment: '视图之间不准互相 import；跳转用 useWorkbench().openView',
      severity: 'error',
      from: { path: '^src/views/([^/]+)/' },
      to: { path: '^src/views/([^/]+)/', pathNot: '^src/views/$1/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.app.json' },
    exclude: { path: '\\.(test|stories)\\.tsx?$' },
  },
};
