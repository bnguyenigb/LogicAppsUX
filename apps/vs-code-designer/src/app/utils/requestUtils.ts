/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { timeoutKey } from '../../constants';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { getWorkspaceSetting } from './vsCodeConfig/settings';
import type { ServiceClient } from '@azure/core-client';
import type { PipelineRequestOptions, PipelineResponse } from '@azure/core-rest-pipeline';
import { createPipelineRequest } from '@azure/core-rest-pipeline';
import { RestError } from '@azure/ms-rest-js';
import type { HTTP_METHODS } from '@microsoft/utils-logic-apps';
import { isString } from '@microsoft/utils-logic-apps';
import { createGenericClient, sendRequestWithTimeout } from '@microsoft/vscode-azext-azureutils';
import type { AzExtPipelineResponse, AzExtRequestPrepareOptions } from '@microsoft/vscode-azext-azureutils';
import { nonNullProp, nonNullValue, parseError } from '@microsoft/vscode-azext-utils';
import type { IActionContext, ISubscriptionContext } from '@microsoft/vscode-azext-utils';
import type { IIdentityWizardContext } from '@microsoft/vscode-extension';
import * as fse from 'fs-extra';
import * as path from 'path';

/**
 * Checks if it is a timeout error.
 * @param {unknown} error - Error object.
 * @returns {boolean} True if error type is a timeout error.
 */
export function isTimeoutError(error: unknown): boolean {
  return parseError(error).errorType === 'REQUEST_ABORTED_ERROR';
}

export async function sendAzureRequest(
  url: string,
  context: IActionContext | IIdentityWizardContext,
  method: HTTP_METHODS = 'GET',
  subscriptionContext?: ISubscriptionContext
): Promise<PipelineResponse> {
  const client: ServiceClient = await createGenericClient(context, subscriptionContext);
  return sendAndParseResponse(client, { url, method });
}

export async function sendRequest(context: IActionContext, options: PipelineRequestOptions): Promise<string> {
  const client: ServiceClient = await createGenericClient(context, undefined);
  const response = await sendAndParseResponse(client, options);
  return response.bodyAsText;
}

async function sendAndParseResponse(client: ServiceClient, options: PipelineRequestOptions): Promise<PipelineResponse> {
  try {
    const request = createPipelineRequest(options);
    const response: AzExtPipelineResponse = await client.sendRequest(request);
    if (response.status < 200 || response.status >= 300) {
      const errorMessage: string = response.bodyAsText
        ? parseError(response.parsedBody || response.bodyAsText).message
        : localize('unexpectedStatusCode', 'Unexpected status code: {0}', response.status);
      throw new RestError(errorMessage, undefined, response.status, /*request*/ undefined, response as any, response.bodyAsText);
    } else {
      return response;
    }
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new Error(
        localize('timeoutFeed', 'Request timed out. Modify setting "{0}.{1}" if you want to extend the timeout.', ext.prefix, timeoutKey)
      );
    } else {
      throw error;
    }
  }
}

/**
 * Send a request using the extension's user-controlled timeout setting
 * @param {IActionContext} context - Command context.
 * @param {AzExtRequestPrepareOptions} options - Options for the request.
 * @returns {Promise<HttpOperationResponse>} True if error type is a timeout error.
 */
export async function sendRequestWithExtTimeout(
  context: IActionContext,
  options: AzExtRequestPrepareOptions
): Promise<AzExtPipelineResponse> {
  const timeout: number = nonNullValue(getWorkspaceSetting<number>(timeoutKey), timeoutKey) * 1000;

  try {
    return await sendRequestWithTimeout(context, options, timeout, undefined);
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new Error(
        localize('timeoutFeed', 'Request timed out. Modify setting "{0}.{1}" if you want to extend the timeout.', ext.prefix, timeoutKey)
      );
    } else {
      throw error;
    }
  }
}

/**
 * Downloads file
 * @param {IActionContext} context - Command context.
 * @param {string | RequestPrepareOptions} requestOptionsOrUrl - Url string or options structure for call header.
 * @param {string} filePath - File path to download.
 */
export async function downloadFile(
  context: IActionContext,
  requestOptionsOrUrl: string | PipelineRequestOptions,
  filePath: string
): Promise<void> {
  await fse.ensureDir(path.dirname(filePath));
  const request = createPipelineRequest(isString(requestOptionsOrUrl) ? { method: 'GET', url: requestOptionsOrUrl } : requestOptionsOrUrl);
  request.streamResponseStatusCodes = new Set([Number.POSITIVE_INFINITY]);
  const client: ServiceClient = await createGenericClient(context, undefined);
  const response: AzExtPipelineResponse = await client.sendRequest(request);
  const stream: NodeJS.ReadableStream = nonNullProp(response, 'readableStreamBody');

  await new Promise((resolve, reject): void => {
    stream.pipe(fse.createWriteStream(filePath).on('finish', resolve).on('error', reject));
  });
}
