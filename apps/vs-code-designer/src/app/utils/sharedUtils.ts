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

export function copyArray(array: any[] | null | undefined, options?: CopyOptions): any[] | null {
  if (!array) {
    return null;
  }

  return array.map((value: any) => {
    return createCopy(value, options);
  });
}

export function createCopy(value: any, options?: CopyOptions): any {
  if (Array.isArray(value)) {
    return copyArray(value, options);
  } else if (value instanceof Date) {
    return new Date(value.valueOf());
  } else if (!!value && typeof value === 'object') {
    return copy({ copyNonEnumerableProps: false, ...options }, {}, value);
  } else {
    return value;
  }
}

export interface CopyOptions {
  copyNonEnumerableProps?: boolean;
}

export function copy(options: CopyOptions, target: any, ...sources: any[]): any {
  if (!sources) {
    return target;
  }

  for (const source of sources) {
    if (source) {
      const keys = options.copyNonEnumerableProps ? new Set(Object.getOwnPropertyNames(source)) : Object.keys(source);
      for (const key of keys) {
        target[key] = createCopy(source[key], options);
      }
    }
  }

  return target;
}

export function isObject(value: any): boolean {
  return Object.prototype.toString.call(value) === '[object Object]';
}

export function extend(target: any, ...sources: any[]): any {
  return copy({ copyNonEnumerableProps: false }, target, ...sources);
}

export function isNullOrEmpty(value: any): boolean {
  if (typeof value === 'object') {
    return !value || !Object.keys(value).length;
  } else {
    return !value;
  }
}
