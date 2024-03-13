export const SchemaType = {
  Source: 'source',
  Target: 'target',
} as const;
export type SchemaType = (typeof SchemaType)[keyof typeof SchemaType];
