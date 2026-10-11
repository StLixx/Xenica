import type { Node } from '../api/client';

export type CanvasProps = {
  node: Node;
  save: (body: Record<string, never>, revision: string) => Promise<Node>;
  sketches: Node[];
  add: () => Promise<void>;
  pick: (id: string) => void;
  creating: boolean;
  rename: (title: string) => Promise<void>;
};
