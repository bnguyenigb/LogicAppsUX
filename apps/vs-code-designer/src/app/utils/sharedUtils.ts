
export function isString(value: any): value is string {
    return typeof value === 'string';
  }

  export type HTTP_METHODS = (typeof HTTP_METHODS)[keyof typeof HTTP_METHODS];
  export const HTTP_METHODS = {
    GET: 'GET',
    PUT: 'PUT',
    POST: 'POST',
    PATCH: 'PATCH',
    DELETE: 'DELETE',
  } as const;

  export function isEmptyString(value: string): value is '' {
    return value === '';
  }

  export function isNullOrUndefined(value: any): value is null | undefined {
    return value === null || value === undefined;
  }
  
  export function extend(target: any, ...sources: any[]): any {
    return copy({ copyNonEnumerableProps: false }, target, ...sources);
  }