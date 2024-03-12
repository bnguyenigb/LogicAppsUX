import { copy, equals, isNullOrEmpty, isNullOrUndefined } from './sharedUtils';

// Exceptions
export interface Exception {
  name: string;
  code?: string;
  message: string;
  data?: Record<string, any>;
  // Note: any is used as a fallback in case it is not an Exception.
  innerException?: Exception | any;
  stack?: string;
}

export function isException(value: any): value is Exception {
  return (
    typeof value === 'object' &&
    typeof value.name === 'string' &&
    (value.code === undefined || typeof value.code === 'string') &&
    typeof value.message === 'string' &&
    (value.data === undefined || typeof value.data === 'object') &&
    (value.stack === undefined || typeof value.stack === 'string')
  );
}
export abstract class BaseException extends Error implements Exception {
  constructor(
    public override name: string,
    public override message: string,
    public code?: string,
    public data?: Record<string, any>,
    public innerException?: Exception | any
  ) {
    super(message);
  }
}
export const ExpressionExceptionCode = {
  UNRECOGNIZED_EXPRESSION: 'UnrecognizedExpression',
  EMPTY_VALUE: 'EmptyValue',
  LIMIT_EXCEEDED: 'LimitExceeded',
  STRING_LITERAL_NOT_TERMINATED: 'StringLiteralNotTerminated',
  TOKEN_NOT_FOUND: 'TokenNotFound',
  UNEXPECTED_CHARACTER: 'UnexpectedCharacter',
  MISUSED_DOUBLE_QUOTES: 'MisusedDoubleQuotes',
} as const;
export type ExpressionExceptionCode = (typeof ExpressionExceptionCode)[keyof typeof ExpressionExceptionCode];

export const ExpressionExceptionName = 'Workflow.ExpressionException';

export class ExpressionException extends BaseException {
  constructor(message: string, code?: ExpressionExceptionCode, data?: Record<string, any>) {
    super(ExpressionExceptionName, message, code, data);
  }
}

// Is blah
export function isTemplateExpression(value: string): boolean {
  if (isNullOrEmpty(value) || value.length < 2) {
    return false;
  }
  return value.charAt(0) === '@' || value.indexOf('@{') > 0;
}

export function isStringLiteral(expression: Expression): expression is ExpressionLiteral {
  return equals(expression.type, ExpressionType.StringLiteral);
}

function isNullLiteral(expression: Expression): boolean {
  return equals(expression.type, ExpressionType.NullLiteral);
}

function isBooleanLiteral(expression: Expression): boolean {
  return equals(expression.type, ExpressionType.BooleanLiteral);
}

function isNumberLiteral(expression: Expression): boolean {
  return equals(expression.type, ExpressionType.NumberLiteral);
}

export function isLiteralExpression(expression: Expression): expression is ExpressionLiteral {
  return isStringLiteral(expression) || isNumberLiteral(expression) || isBooleanLiteral(expression) || isNullLiteral(expression);
}

export function isFunction(expression: Expression): expression is ExpressionFunction {
  return equals(expression.type, ExpressionType.Function);
}

export interface ExpressionEvaluationContext {
  /**
   * @member {Record<string, any>} parameters - The parameters.
   */
  parameters: Record<string, any>;

  /**
   * @member {Record<string, any>} appsettings - The appsettings.
   */
  appsettings: Record<string, any>;
}

export type Expression = ExpressionLiteral | ExpressionFunction | ExpressionStringInterpolation;

interface ExpressionBase {
  type: ExpressionType;
}

export interface ExpressionLiteral extends ExpressionBase {
  value: string;
}

export interface ExpressionFunction extends ExpressionBase {
  expression: string;
  name: string;
  startPosition: number;
  endPosition: number;
  arguments: Expression[];
  dereferences: Dereference[];
}

export interface ExpressionStringInterpolation extends ExpressionBase {
  segments: Expression[];
}

export interface Dereference {
  isSafe: boolean;
  isDotNotation: boolean;
  expression: Expression;
}

export const ExpressionType = {
  NullLiteral: 'NullLiteral',
  BooleanLiteral: 'BooleanLiteral',
  NumberLiteral: 'NumberLiteral',
  StringLiteral: 'StringLiteral',
  Function: 'Function',
  StringInterpolation: 'StringInterpolation',
} as const;
export type ExpressionType = (typeof ExpressionType)[keyof typeof ExpressionType];

export const ExpressionFunctionNames = {
  PARAMETERS: 'PARAMETERS',
  APPSETTING: 'APPSETTING',
} as const;
export type ExpressionFunctionNames = (typeof ExpressionFunctionNames)[keyof typeof ExpressionFunctionNames];

export interface ParametersObject {
  type: string;
  value: any;
}

export function isStringInterpolation(expression: Expression): expression is ExpressionStringInterpolation {
  return equals(expression.type, ExpressionType.StringInterpolation);
}

export function isParameterOrAppSettingExpression(functionName: string): boolean {
  return isParameterExpression(functionName) || isAppSettingExpression(functionName);
}

function isParameterExpression(functionName: string) {
  return equals(functionName, ExpressionFunctionNames.PARAMETERS);
}

function isAppSettingExpression(functionName: string) {
  return equals(functionName, ExpressionFunctionNames.APPSETTING);
}

export const isParametersObject = (parameters: any): parameters is ParametersObject => {
  return !isNullOrUndefined(parameters.type) && !isNullOrUndefined(parameters.value);
};

export class ResolutionService {
  private _context: ExpressionEvaluationContext;

  constructor(parameters: Record<string, unknown>, appsettings: Record<string, unknown>) {
    const parsedOutParameters: Record<string, any> = {};
    for (const key in parameters) {
      const value = parameters[key];
      if (isParametersObject(value)) {
        parsedOutParameters[key] = value.value;
      } else {
        parsedOutParameters[key] = value;
      }
    }
    this._context = { parameters: parsedOutParameters, appsettings };
  }

  resolve(root: any) {
    if (this._isContextEmptyOrUndefined) {
      return root;
    }

    return this._resolve(root);
  }

  private get _isContextEmptyOrUndefined() {
    return (
      !this._context ||
      ((!this._context.parameters || Object.keys(this._context.parameters).length === 0) &&
        (!this._context.appsettings || Object.keys(this._context.appsettings).length === 0))
    );
  }

  private _resolve(root: any) {
    if (!!root && typeof root === 'object') {
      return this._resolveObject(root);
    } else if (typeof root === 'string') {
      return this._resolveString(root);
    }

    return root;
  }

  private _resolveString(root: string) {
    let parsedExpression: Expression = { value: '', type: ExpressionType.StringLiteral };

    if (isTemplateExpression(root)) {
      parsedExpression = ExpressionParser.parseTemplateExpression(root);
    } else {
      return root;
    }

    if (isStringInterpolation(parsedExpression)) {
      return this._resolveStringInterpolationExpression(parsedExpression);
    } else if (isFunction(parsedExpression)) {
      return this._resolveFunction(parsedExpression);
    } else if (isLiteralExpression(parsedExpression)) {
      return this._resolveLiteralExpression(parsedExpression);
    } else {
      throw new ExpressionException(ExpressionExceptionCode.UNEXPECTED_CHARACTER, ExpressionExceptionCode.UNEXPECTED_CHARACTER);
    }
  }

  private _resolveStringInterpolationExpression(expression: ExpressionStringInterpolation) {
    let resolvedExpression = '';

    for (const segment of expression.segments) {
      if (isFunction(segment) && this._isFunctionParameterOrAppSetting(segment.name)) {
        resolvedExpression = `${resolvedExpression}${this._evaluate(
          `@${segment.expression.substring(segment.startPosition, segment.endPosition)}`
        )}`;
      } else if (isLiteralExpression(segment)) {
        resolvedExpression = `${resolvedExpression}${segment.value}`;
      }
    }

    return resolvedExpression;
  }

  private _resolveLiteralExpression(expression: ExpressionLiteral) {
    return expression.value;
  }

  private _resolveFunction(functionExpression: ExpressionFunction) {
    const expression = `@${functionExpression.expression}`;
    if (this._isFunctionParameterOrAppSetting(functionExpression.name)) {
      return this._evaluate(expression);
    } else {
      return expression;
    }
  }

  private _resolveObject(root: any) {
    const rootCopy = copy({ copyNonEnumerableProps: false }, {}, root);

    for (const key of Object.keys(rootCopy)) {
      rootCopy[key] = this._resolve(rootCopy[key]);
    }

    return rootCopy;
  }

  private _evaluate(expression: string): any {
    if (!expression) {
      throw new ExpressionException(ExpressionExceptionCode.EMPTY_VALUE, ExpressionExceptionCode.EMPTY_VALUE);
    }

    const parsedTemplateExpression = ExpressionParser.parseTemplateExpression(expression);

    let segment = parsedTemplateExpression;
    let isStringInterpolationExpression = false;
    if (isStringInterpolation(parsedTemplateExpression)) {
      if (parsedTemplateExpression.segments.length === 1) {
        segment = parsedTemplateExpression.segments[0];
        isStringInterpolationExpression = true;
      }
    }

    if (isFunction(segment)) {
      const evaluatedExpression = this._evaluateFunctionExpression(segment, isStringInterpolationExpression);
      return !isNullOrUndefined(evaluatedExpression) ? evaluatedExpression : expression;
    }

    return this._evaluateUsingRegex(expression);
  }

  private _evaluateFunctionExpression(expression: ExpressionFunction, isStringInterpolationExpression: boolean): string | undefined {
    const functionName = expression.name;
    if (
      equals(functionName, ExpressionFunctionNames.PARAMETERS) ||
      (equals(functionName, ExpressionFunctionNames.APPSETTING) && expression.arguments.length === 1)
    ) {
      const argument = expression.arguments[0];
      if (isStringLiteral(argument)) {
        const result = equals(functionName, ExpressionFunctionNames.PARAMETERS)
          ? this._context.parameters[argument.value]
          : this._context.appsettings[argument.value];
        if (isStringInterpolationExpression) {
          if (!result && typeof result === 'string') {
            return result;
          }
        } else {
          return result;
        }
      } else if (isFunction(argument)) {
        return this._evaluateFunctionExpression(argument, false) as string;
      }
    }
    return undefined;
  }

  private _evaluateUsingRegex(expression: string): string {
    if (/^@@/.test(expression)) {
      return expression.substring(1);
    }

    if (/@@{/.test(expression)) {
      return expression.replace(/@@{/g, '@{');
    }

    if (/^@/.test(expression) || /@{/.test(expression)) {
      throw new ExpressionException(ExpressionExceptionCode.UNRECOGNIZED_EXPRESSION, ExpressionExceptionCode.UNRECOGNIZED_EXPRESSION);
    }

    return expression;
  }

  private _isFunctionParameterOrAppSetting(name: string) {
    return equals(name, ExpressionFunctionNames.PARAMETERS) || equals(name, ExpressionFunctionNames.APPSETTING);
  }
}

export const ExpressionTokenType = {
  Dot: 'Dot',
  Comma: 'Comma',
  LeftParenthesis: 'LeftParenthesis',
  RightParenthesis: 'RightParenthesis',
  LeftSquareBracket: 'LeftSquareBracket',
  RightSquareBracket: 'RightSquareBracket',
  QuestionMark: 'QuestionMark',
  StringLiteral: 'StringLiteral',
  IntegerLiteral: 'IntegerLiteral',
  FloatLiteral: 'FloatLiteral',
  Identifier: 'Identifier',
  EndOfData: 'EndOfData',
} as const;
export type ExpressionTokenType = (typeof ExpressionTokenType)[keyof typeof ExpressionTokenType];

// Expression Parser
interface TokenToParse {
  tokenType: ExpressionTokenType;
  responseExpressionType: ExpressionType;
  value?: string;
}

export const ParserExceptionName = 'Workflow.ExpressionParserException';

/**
 * The expression parser error code.
 */
export const ExpressionParserErrorCode = {
  NOT_EXPRESSION: 'NotExpression',
  SEGMENT_NOT_TERMINATED: 'SegmentNotTerminated',
  UNEXPECTED_DEREFERENCE: 'UnexpectedDereference',
} as const;
export type ExpressionParserErrorCode = (typeof ExpressionParserErrorCode)[keyof typeof ExpressionParserErrorCode];

export class ParserException extends BaseException {
  constructor(message: string, code?: ExpressionExceptionCode, data?: Record<string, any>) {
    super(ParserExceptionName, message, code, data);
  }
}

export interface ExpressionToken {
  type: ExpressionTokenType;
  value: string;
  startPosition: number;
  endPosition: number;
}

export class ExpressionParser {
  private static _tokenList: TokenToParse[] = [
    {
      tokenType: ExpressionTokenType.StringLiteral,
      responseExpressionType: ExpressionType.StringLiteral,
    },
    {
      tokenType: ExpressionTokenType.IntegerLiteral,
      responseExpressionType: ExpressionType.NumberLiteral,
    },
    {
      tokenType: ExpressionTokenType.FloatLiteral,
      responseExpressionType: ExpressionType.NumberLiteral,
    },
    {
      tokenType: ExpressionTokenType.Identifier,
      value: 'null',
      responseExpressionType: ExpressionType.NullLiteral,
    },
    {
      tokenType: ExpressionTokenType.Identifier,
      value: 'true',
      responseExpressionType: ExpressionType.BooleanLiteral,
    },
    {
      tokenType: ExpressionTokenType.Identifier,
      value: 'false',
      responseExpressionType: ExpressionType.BooleanLiteral,
    },
  ];

  public static parseExpression(expression: string, isAliasPathParsingEnabled = false): Expression {
    const scanner = new ExpressionScanner(expression);
    const parsedExpression = ExpressionParser._parseExpressionRecursively(scanner, 0, isAliasPathParsingEnabled);
    scanner.getTokenForTypeAndValue(ExpressionTokenType.EndOfData);
    return parsedExpression;
  }

  public static parseTemplateExpression(expression: string, isAliasPathParsingEnabled = false): Expression {
    if (!isTemplateExpression(expression)) {
      throw new ParserException(ExpressionExceptionCode.UNRECOGNIZED_EXPRESSION, ExpressionExceptionCode.UNRECOGNIZED_EXPRESSION);
    }

    if (expression.charAt(0) === '@' && expression.charAt(1) !== '{') {
      if (expression.charAt(1) === '@') {
        return {
          type: ExpressionType.StringLiteral,
          value: expression.substring(1),
        };
      } else {
        return ExpressionParser.parseExpression(expression.substring(1), isAliasPathParsingEnabled);
      }
    } else {
      return ExpressionParser._parseStringInterpolationExpression(expression, isAliasPathParsingEnabled);
    }
  }

  private static _parseExpressionRecursively(scanner: ExpressionScanner, index = 0, isAliasPathParsingEnabled: boolean): Expression {
    if (index < this._tokenList.length) {
      const token = scanner.getTokenForTypeAndValue(ExpressionParser._tokenList[index].tokenType, ExpressionParser._tokenList[index].value);
      if (token) {
        return {
          type: this._tokenList[index].responseExpressionType,
          value: token.value,
        };
      }
      return ExpressionParser._parseExpressionRecursively(scanner, index + 1, isAliasPathParsingEnabled);
    } else {
      return this._parseFunctionExpression(scanner, isAliasPathParsingEnabled);
    }
  }

  private static _getTokenOrThrowException(scanner: ExpressionScanner, type: ExpressionTokenType, value?: string): ExpressionToken {
    const token = scanner.getTokenForTypeAndValue(type, value);
    if (token) {
      return token;
    }
    throw new ParserException(ExpressionExceptionCode.UNRECOGNIZED_EXPRESSION, ExpressionExceptionCode.UNRECOGNIZED_EXPRESSION);
  }

  private static _parseFunctionExpression(scanner: ExpressionScanner, isAliasPathParsingEnabled: boolean): ExpressionFunction {
    let token: ExpressionToken | undefined = ExpressionParser._getTokenOrThrowException(scanner, ExpressionTokenType.Identifier);

    const startPosition = token.startPosition;
    const functionName = token.value;

    ExpressionParser._getTokenOrThrowException(scanner, ExpressionTokenType.LeftParenthesis);

    const functionArguments: Expression[] = [];
    token = scanner.getTokenForTypeAndValue(ExpressionTokenType.RightParenthesis);
    if (!token) {
      do {
        functionArguments.push(this._parseExpressionRecursively(scanner, 0, /*isAliasPathParsingEnabled*/ false));
      } while (scanner.getTokenForTypeAndValue(ExpressionTokenType.Comma));

      token = ExpressionParser._getTokenOrThrowException(scanner, ExpressionTokenType.RightParenthesis);
    }

    const dereferences: Dereference[] = [];
    let flag = true;

    while (flag) {
      const isSafe = !!scanner.getTokenForTypeAndValue(ExpressionTokenType.QuestionMark);

      if (scanner.getTokenForTypeAndValue(ExpressionTokenType.Dot)) {
        token = ExpressionParser._getTokenOrThrowException(scanner, ExpressionTokenType.Identifier);
        dereferences.push({
          isSafe,
          isDotNotation: false,
          expression: {
            type: ExpressionType.StringLiteral,
            value: token.value,
          },
        });
        continue;
      }

      if (scanner.getTokenForTypeAndValue(ExpressionTokenType.LeftSquareBracket)) {
        const expression = this._parseExpressionRecursively(scanner, 0, /*isAliasPathParsingEnabled*/ false);
        token = ExpressionParser._getTokenOrThrowException(scanner, ExpressionTokenType.RightSquareBracket);

        // TODO: This might require to support string interpolation as well.
        if (expression.type === ExpressionType.StringLiteral && isAliasPathParsingEnabled) {
          // takes care of expressions that are nested such as ['body/value']
          for (const expressionValue of (expression as ExpressionLiteral).value.split('/')) {
            dereferences.push({
              isSafe,
              isDotNotation: false,
              expression: { type: ExpressionType.StringLiteral, value: expressionValue },
            });
          }
        } else {
          dereferences.push({
            isSafe,
            isDotNotation: false,
            expression: expression,
          });
        }
        continue;
      }

      if (isSafe) {
        throw new ParserException(ExpressionExceptionCode.UNRECOGNIZED_EXPRESSION, ExpressionExceptionCode.UNRECOGNIZED_EXPRESSION);
      }

      flag = false;
    }

    return {
      type: ExpressionType.Function,
      expression: scanner.expression,
      startPosition,
      endPosition: token.endPosition,
      name: functionName,
      arguments: functionArguments,
      dereferences,
    };
  }

  private static _parseStringInterpolationExpression(
    expression: string,
    isAliasPathParsingEnabled: boolean
  ): ExpressionStringInterpolation {
    let previousPosition = 0;
    let currentPosition = 0;
    const segments: Expression[] = [];

    while (currentPosition < expression.length - 1) {
      if (!equals(expression.charAt(currentPosition), '@') || !equals(expression.charAt(currentPosition + 1), '{')) {
        ++currentPosition;
        continue;
      }

      if (previousPosition < currentPosition) {
        const value = expression.substring(previousPosition, currentPosition);
        segments.push({
          type: ExpressionType.StringLiteral,
          value: value,
        });
      }

      if (currentPosition > 0 && expression.charAt(currentPosition - 1) === '@') {
        previousPosition = ++currentPosition;
        continue;
      }

      const startPosition = currentPosition;
      let literalRegion = false;
      let found = false;

      while (currentPosition < expression.length) {
        if (equals(expression.charAt(currentPosition), "'")) {
          literalRegion = !literalRegion;
        } else if (!literalRegion && expression.charAt(currentPosition) === '}') {
          found = true;
          break;
        }

        ++currentPosition;
      }

      if (!found) {
        throw new ParserException(
          ExpressionExceptionCode.STRING_LITERAL_NOT_TERMINATED,
          ExpressionExceptionCode.STRING_LITERAL_NOT_TERMINATED
        );
      }

      segments.push(this.parseExpression(expression.substring(startPosition + 2, currentPosition), isAliasPathParsingEnabled));
      previousPosition = ++currentPosition;
    }

    if (previousPosition < expression.length) {
      segments.push({
        type: ExpressionType.StringLiteral,
        value: expression.substring(previousPosition),
      });
    }

    return {
      type: ExpressionType.StringInterpolation,
      segments,
    };
  }
}

export class ExpressionConstants {
  public static Expression = {
    maxExpressionLimit: 8192,
  };

  public static TokenValue = {
    dot: '.',
    comma: ',',
    leftParenthesis: '(',
    rightParenthesis: ')',
    leftSquareBracket: '[',
    rightSquareBracket: ']',
    questionMark: '?',
    singleQuote: "'",
  };
}

export const ScannerExceptionName = 'Workflow.ExpressionScannerException';

export class ScannerException extends BaseException {
  constructor(message: string, code?: ExpressionExceptionCode, data?: Record<string, any>) {
    super(ScannerExceptionName, message, code, data);
  }
}

export function isNumeric(ch: string) {
  return /[0-9]/g.test(ch);
}

export function isWhitespace(ch: string) {
  // Note: https://msdn.microsoft.com/en-us/library/system.char.iswhitespace.aspx
  switch (ch) {
    case '\u0020':
    case '\u1680':
    case '\u2000':
    case '\u2001':
    case '\u2002':
    case '\u2003':
    case '\u2004':
    case '\u2005':
    case '\u2006':
    case '\u2007':
    case '\u2008':
    case '\u2009':
    case '\u200a':
    case '\u202f':
    case '\u205f':
    case '\u3000':
    case '\u2028':
    case '\u2029':
    case '\u0009':
    case '\u000a':
    case '\u000b':
    case '\u000c':
    case '\u000d':
    case '\u0085':
    case '\u00a0':
      return true;

    default:
      return false;
  }
}

export class ExpressionScanner {
  private _expression: string;
  private _startPosition: number;
  private _currentToken: ExpressionToken;

  constructor(expression: string, prefetch = true) {
    if (expression.length > ExpressionConstants.Expression.maxExpressionLimit) {
      throw new ScannerException(ExpressionExceptionCode.LIMIT_EXCEEDED, ExpressionExceptionCode.LIMIT_EXCEEDED);
    }

    this._expression = expression;
    this._startPosition = 0;
    this._currentToken = this._createToken('', ExpressionTokenType.EndOfData, 0, 0);

    if (prefetch) {
      this._currentToken = this._readNextToken();
    }
  }

  /**
   * Gets the expression.
   * @return {string}
   */
  public get expression(): string {
    return this._expression;
  }

  /**
   * Gets the token with specified expression token type.
   * @arg {ExpressionTokenType} type - The expression token type.
   * @arg {string} value - The expression token value.
   * @return {ExpressionToken}
   */
  public getTokenForTypeAndValue(type: ExpressionTokenType, value?: string): ExpressionToken | undefined {
    if (this._currentToken.type === type && (!value || equals(value, this._currentToken.value))) {
      return this._getToken();
    }
    return undefined;
  }

  /**
   * Gets the next token.
   * @return {ExpressionToken}
   */
  public getNextToken(): ExpressionToken {
    this._currentToken = this._readNextToken();
    return this._currentToken;
  }

  private _getToken(): ExpressionToken {
    const token = this._currentToken;
    this._currentToken = this._readNextToken();
    return token;
  }

  private _readNextToken() {
    const expression = this._expression;
    const initialStartPos = this._startPosition;
    let currentPos = initialStartPos;
    let token: ExpressionToken | undefined;
    while (currentPos < expression.length && isWhitespace(expression.charAt(currentPos))) {
      ++currentPos;
    }

    if (currentPos < expression.length) {
      const currentChar = expression.charAt(currentPos);
      token = this._checkAndReturnValidToken(currentPos);
      if (!token) {
        if (equals(currentChar, ExpressionConstants.TokenValue.singleQuote)) {
          token = this._processAndgetTokenForSingleQuote(currentPos);
        } else {
          token = this._processAndGetToken(currentPos);
        }
      }
    } else {
      this._startPosition = currentPos + 1;
      token = this._createToken('', ExpressionTokenType.EndOfData, initialStartPos, this._startPosition);
    }

    return token;
  }

  private _processAndGetToken(currentPos: number): ExpressionToken {
    const ch = this._expression.charAt(currentPos);

    if (equals(ch, '+') || equals(ch, '-') || isNumeric(ch)) {
      return this._processAndGetTokenForNumber(currentPos);
    } else if (this._isSupportedIdentifierCharacter(ch)) {
      const token = this._processAndGetTokenForIdentifier(currentPos);
      if (token.value.startsWith('"') && token.value.endsWith('"')) {
        throw new ScannerException(ExpressionExceptionCode.MISUSED_DOUBLE_QUOTES, ExpressionExceptionCode.MISUSED_DOUBLE_QUOTES);
      }
      return token;
    } else {
      throw new ScannerException(ExpressionExceptionCode.UNEXPECTED_CHARACTER, ExpressionExceptionCode.UNEXPECTED_CHARACTER);
    }
  }

  private _processAndGetTokenForNumber(currentPos: number): ExpressionToken {
    const expression = this._expression;
    const startPos = currentPos;
    const initialStartPos = this._startPosition;
    let ch = expression.charAt(currentPos);

    currentPos = equals(ch, '+') || equals(ch, '-') ? currentPos + 1 : currentPos;
    let isFloat = false;
    currentPos = this._scanForwardUsingPredicate(currentPos, (c) => isNumeric(c));

    if (currentPos < expression.length && equals(expression.charAt(currentPos), ExpressionConstants.TokenValue.dot)) {
      isFloat = true;
      currentPos = this._scanForwardUsingPredicate(currentPos + 1, (c) => isNumeric(c));
    }

    if (currentPos < expression.length && equals(expression.charAt(currentPos), 'e')) {
      isFloat = true;
      ch = expression.charAt(currentPos + 1);
      currentPos = equals(ch, '+') || equals(ch, '-') ? currentPos + 2 : currentPos + 1;
      currentPos = this._scanForwardUsingPredicate(currentPos, (c) => isNumeric(c));
    }

    if (currentPos < expression.length && this._isSupportedIdentifierCharacter(expression.charAt(currentPos))) {
      throw new ScannerException(ExpressionExceptionCode.UNEXPECTED_CHARACTER, ExpressionExceptionCode.UNEXPECTED_CHARACTER);
    }

    this._startPosition = currentPos;
    const value = expression.substring(startPos, currentPos);

    return isFloat
      ? this._createToken(value, ExpressionTokenType.FloatLiteral, initialStartPos, this._startPosition)
      : this._createToken(value, ExpressionTokenType.IntegerLiteral, initialStartPos, this._startPosition);
  }

  private _processAndGetTokenForIdentifier(currentPos: number): ExpressionToken {
    const initialStartPos = this._startPosition;
    this._startPosition = this._scanForwardUsingPredicate(currentPos, (c) => this._isSupportedIdentifierCharacter(c));
    const value = this._expression.substring(currentPos, this._startPosition);
    return this._createToken(value, ExpressionTokenType.Identifier, initialStartPos, this._startPosition);
  }

  private _processAndgetTokenForSingleQuote(currentPos: number): ExpressionToken {
    const expression = this._expression;
    const startPos = currentPos;
    while (currentPos < expression.length) {
      currentPos = this._scanForwardUsingPredicate(currentPos + 1, (c) => c !== ExpressionConstants.TokenValue.singleQuote);

      if (currentPos + 1 < expression.length && expression.charAt(currentPos + 1) === ExpressionConstants.TokenValue.singleQuote) {
        currentPos++;
      } else {
        break;
      }
    }

    if (currentPos >= expression.length) {
      throw new ScannerException(
        ExpressionExceptionCode.STRING_LITERAL_NOT_TERMINATED,
        ExpressionExceptionCode.STRING_LITERAL_NOT_TERMINATED
      );
    }

    const litervalValue = expression.substring(startPos + 1, currentPos).replace(/''/g, ExpressionConstants.TokenValue.singleQuote);
    const token = this._createToken(litervalValue, ExpressionTokenType.StringLiteral, this._startPosition, currentPos + 1);
    this._startPosition = currentPos + 1;
    return token;
  }

  private _checkAndReturnValidToken(currentPos: number): ExpressionToken | undefined {
    let tokenType;
    let tokenValue;
    switch (this._expression.charAt(currentPos)) {
      case ExpressionConstants.TokenValue.dot: {
        tokenType = ExpressionTokenType.Dot;
        tokenValue = ExpressionConstants.TokenValue.dot;
        break;
      }
      case ExpressionConstants.TokenValue.comma: {
        tokenType = ExpressionTokenType.Comma;
        tokenValue = ExpressionConstants.TokenValue.comma;
        break;
      }
      case ExpressionConstants.TokenValue.leftParenthesis: {
        tokenType = ExpressionTokenType.LeftParenthesis;
        tokenValue = ExpressionConstants.TokenValue.leftParenthesis;
        break;
      }
      case ExpressionConstants.TokenValue.rightParenthesis: {
        tokenType = ExpressionTokenType.RightParenthesis;
        tokenValue = ExpressionConstants.TokenValue.rightParenthesis;
        break;
      }
      case ExpressionConstants.TokenValue.leftSquareBracket: {
        tokenType = ExpressionTokenType.LeftSquareBracket;
        tokenValue = ExpressionConstants.TokenValue.leftSquareBracket;
        break;
      }
      case ExpressionConstants.TokenValue.rightSquareBracket: {
        tokenType = ExpressionTokenType.RightSquareBracket;
        tokenValue = ExpressionConstants.TokenValue.rightSquareBracket;
        break;
      }
      case ExpressionConstants.TokenValue.questionMark: {
        tokenType = ExpressionTokenType.QuestionMark;
        tokenValue = ExpressionConstants.TokenValue.questionMark;
        break;
      }
      default: {
        tokenType = undefined;
        tokenValue = undefined;
        break;
      }
    }

    if (!!tokenType && !!tokenValue) {
      const token = this._createToken(tokenValue, tokenType, this._startPosition, currentPos + 1);
      this._startPosition = currentPos + 1;
      return token;
    }
    return undefined;
  }

  private _isSupportedIdentifierCharacter(ch: string) {
    return !/[.,(){}@[\]?{}@']{1}/i.test(ch) && !isWhitespace(ch);
  }

  private _scanForwardUsingPredicate(startPosition: number, predicate: (c: string) => boolean) {
    const expression = this._expression;
    while (startPosition < expression.length && predicate(expression.charAt(startPosition))) {
      startPosition++;
    }

    return startPosition;
  }

  private _createToken(value: string, type: ExpressionTokenType, startPos: number, endPos: number): ExpressionToken {
    return {
      type,
      value,
      startPosition: startPos,
      endPosition: endPos,
    };
  }
}
