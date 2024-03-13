export const Theme = {
  Dark: 'dark',
  Light: 'light',
};
export type Theme = (typeof Theme)[keyof typeof Theme];

export interface ConnectionCreationInfo {
  connectionParametersSet?: ConnectionParameterSetValues;
  connectionParameters?: Record<string, any>;
  alternativeParameterValues?: Record<string, any>;
  displayName?: string;
  parameterName?: string;
  appSettings?: Record<string, string>;
  additionalParameterValues?: Record<string, string>;
}

export interface ConnectionParameterSetValues {
  name: string;
  values: Record<string, ValueObject>;
}

export interface ValueObject {
  value: any;
}

export function isNullOrEmpty(value: any): boolean {
  if (typeof value === 'object') {
    return !value || !Object.keys(value).length;
  } else {
    return !value;
  }
}

export interface ArmResource<TProperties> {
  id: string;
  type: string;
  name: string;
  location?: string;
  kind?: string;
  tags?: Record<string, string>;
  properties: TProperties;
}

export function isEmptyString(value: string): value is '' {
  return value === '';
}

export const RUN_AFTER_STATUS = {
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
  TIMEDOUT: 'TIMEDOUT',
};
export type RUN_AFTER_STATUS = (typeof RUN_AFTER_STATUS)[keyof typeof RUN_AFTER_STATUS];

export const RUN_AFTER_COLORS = {
  light: {
    [RUN_AFTER_STATUS.SUCCEEDED]: '#428000',
    [RUN_AFTER_STATUS.TIMEDOUT]: '#DB7500',
    [RUN_AFTER_STATUS.SKIPPED]: '#605E5C',
    [RUN_AFTER_STATUS.FAILED]: '#A4262C',
    ['EMPTY']: '#fff',
  },
  dark: {
    [RUN_AFTER_STATUS.SUCCEEDED]: '#92C353',
    [RUN_AFTER_STATUS.TIMEDOUT]: '#FCE100',
    [RUN_AFTER_STATUS.SKIPPED]: '#A19F9D',
    [RUN_AFTER_STATUS.FAILED]: '#F1707B',
    ['EMPTY']: '#323130',
  },
};

// http

export type HTTP_METHODS = (typeof HTTP_METHODS)[keyof typeof HTTP_METHODS];
export const HTTP_METHODS = {
  GET: 'GET',
  PUT: 'PUT',
  POST: 'POST',
  PATCH: 'PATCH',
  DELETE: 'DELETE',
} as const;

interface BatchHttpMethods {
  GET: void;
  HEAD: void;
  POST: void;
  PUT: void;
  DELETE: void;
  PATCH: void;
}

type BatchHttpMethod = keyof BatchHttpMethods;

export interface HttpRequestOptions<ContentType> {
  uri: string;
  type?: BatchHttpMethod;
  content?: ContentType;
  headers?: Record<string, string>;
  queryParameters?: QueryParameters;
  noAuth?: boolean;
  returnHeaders?: boolean;
}

export interface QueryParameters {
  [paramName: string]: string | number;
}

export interface IHttpClient {
  dispose(): void;
  get<ReturnType>(options: HttpRequestOptions<unknown>): Promise<ReturnType>;
  post<ReturnType, BodyType>(options: HttpRequestOptions<BodyType>): Promise<ReturnType>;
  put<ReturnType, BodyType>(options: HttpRequestOptions<BodyType>): Promise<ReturnType>;
  delete<ReturnType>(options: HttpRequestOptions<unknown>): Promise<ReturnType>;
}

export interface ApiHubServiceDetails {
  apiVersion: string;
  baseUrl: string;
  httpClient: IHttpClient;
  subscriptionId: string;
  resourceGroup: string;
  location: string;
  locale?: string;
  filterByLocation?: boolean;
  tenantId?: string;
}

export interface ListDynamicValue {
  value: any;
  displayName: string;
  description?: string;
  disabled?: boolean;
}

/* Run instance definition types */
