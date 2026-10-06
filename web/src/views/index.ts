/**
 * 视图注册表。新视图：在 src/views/<名字>/ 下用 defineView 定义，然后加进这个数组。
 * 视图之间不准互相 import（dependency-cruiser 检查），要跳转就用 useWorkbench().openView。
 */
import { graphView } from './graph';
import { nodeView } from './node';
import { nodesView } from './nodes';

export const views = [nodesView, nodeView, graphView];
