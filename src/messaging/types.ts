export type OverlayMode = 'default' | 'inspect' | 'edit';

export type Message =
  | { type: 'MODE_CHANGE'; mode: OverlayMode }
  | { type: 'RUN_DETECTION' }
  | { type: 'CLEAR_OVERLAYS' }
  | { type: 'PAGE_INFO_UPDATED'; payload: { pageInfo: any; schemas: any[] } }
  | { type: 'NODE_SELECTED_IN_PAGE'; payload: any }
  | { type: 'ELEMENT_HOVER'; payload: { element: any } }
  | { type: 'ELEMENT_SELECTED'; payload: { element: any } }
  | { type: 'GET_PAGE_INFO' }
  | { type: 'GET_DOM_TREE' }
  | { type: 'HIGHLIGHT_ELEMENT'; selector: string }
  | { type: 'CREATE_SCHEMA'; name?: string; element?: string }
  | { type: 'EXTRACT_WITH_SCHEMA'; schemaId: string }
  | { type: 'SCHEMAS_UPDATED'; payload: { schemas: any[] } };

export interface ElementInfo {
  tagName: string;
  id?: string;
  className?: string;
  textContent?: string;
  selector?: string;
}
