// Schema types for reusable extraction schemas
export type SchemaSource = 'auto' | 'manual';

export type SchemaFieldType = 'text' | 'html' | 'attribute' | 'markdown' | 'list';

export interface SchemaField {
  name: string;
  selector?: string;
  type: SchemaFieldType;
  attribute?: string;
  required?: boolean;
}

export interface ExtractionSchema {
  id: string;
  name: string;
  description?: string;
  source: SchemaSource;
  pageType?: string;
  domain?: string;
  urlPattern?: string;
  createdAt: number;
  updatedAt: number;
  
  // Target definition
  targetSelector?: string;
  targetNodeId?: string;
  targetSignature?: string;
  regionKind?: string;
  
  // Field mappings
  fields: SchemaField[];
  
  // Extraction config
  extractionTemplate?: string;
  format?: 'markdown' | 'json' | 'llm-context';
}

export interface SchemaStore {
  schemas: ExtractionSchema[];
  getSchemasForPage(domain?: string, url?: string, pageType?: string): ExtractionSchema[];
  saveSchema(schema: ExtractionSchema): void;
  deleteSchema(id: string): void;
} 
