// Takes what looks like a credential out of text and addresses before they leave the browser.
// Pure functions on strings: no chrome.* and no DOM.
//
// It goes by shape, not by website: a block that says it is a private key, a token of three
// encoded parts, a credential behind "Bearer", a value behind a name such as "password" or
// "api_key", and the parameters of an address that carry such names. It is a net with holes: a
// secret of no known shape, or one a page shows under another name, passes. What it catches is
// replaced by a fixed mark, so that the agent sees that something was there.

export const REDACTED = '[redacted]';

/** Names under which credentials travel: in an address's parameters, and in front of a value in text. */
const SECRET_NAME = '(?:[a-z0-9]+[_.-])*(?:pass(?:word|wd)?|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|auth(?:orization)?|credentials?|signature|sig|jwt|session[_-]?id|sid|otp)';
/** Two more that are credentials in an address and too common as words in text. */
const ADDRESS_ONLY = 'code|key';

const ADDRESS_PARAMETER = new RegExp(`([?&#;](?:${SECRET_NAME}|${ADDRESS_ONLY})=)([^&#;\\s"'<>)\\]}]+)`, 'gi');
const USER_INFO = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi;
const PRIVATE_KEY = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/g;
const THREE_PART_TOKEN = /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const BEHIND_SCHEME = /\b(Bearer|Basic)(\s+)[A-Za-z0-9._~+/=-]{16,}/g;
/**
 * A name of a credential, then a colon or an equals sign, then a value that looks like one: at
 * least eight characters without a blank, with a letter and a digit among them. A value that is
 * a plain word is left: "Password: required" is a sentence, and a line of a snapshot that names
 * a password field is no secret. What an earlier step has marked already is not gone over again.
 */
const NAMED_VALUE = new RegExp(
  `((?:^|[^A-Za-z0-9])(?:${SECRET_NAME})["']?\\s*[:=]\\s*["']?)(?!\\[redacted\\])(?=[^\\s"',;]*[0-9])(?=[^\\s"',;]*[A-Za-z])([^\\s"',;]{8,})`, 'gi');

/** An address without the values of parameters that carry credentials, and without a user and password in front of the host. */
export function redactUrl(url: string): string;
export function redactUrl(url: string | undefined): string | undefined;
export function redactUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  return url.replace(USER_INFO, `$1${REDACTED}@`).replace(ADDRESS_PARAMETER, `$1${REDACTED}`);
}

/** Text without what looks like a credential. What is taken out is replaced by a fixed mark. */
export function redactText(text: string): string {
  if (!text) return text;
  return text
    .replace(PRIVATE_KEY, `${REDACTED} (a private key)`)
    .replace(THREE_PART_TOKEN, REDACTED)
    .replace(BEHIND_SCHEME, `$1$2${REDACTED}`)
    .replace(USER_INFO, `$1${REDACTED}@`)
    .replace(ADDRESS_PARAMETER, `$1${REDACTED}`)
    .replace(NAMED_VALUE, `$1${REDACTED}`);
}
