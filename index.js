'use strict';

const {readFileSync} = require('fs');
const {inspect} = require('util');

const inspectWithKind = require('inspect-with-kind');

const URL_ERROR = 'Expected a URL of the resource serving Server-sent events';
const HASH_SEARCH_ERROR = 'Expected URL to have no hash and search parameter';
const template = readFileSync(require.resolve('./client.js'), 'utf8');
const legacyTemplate = readFileSync(require.resolve('./client-legacy.js'), 'utf8');
const polyfill = readFileSync(require.resolve('event-source-polyfill/src/eventsource.min.js'), 'utf8');

function invalidateHashAndSearch(url) {
	for (const [propName, val] of new Map([
		['hash', url.hash],
		['search parameter', url.search]
	])) {
		if (val) {
			const error = new Error(`${HASH_SEARCH_ERROR}, but got ${
				inspect(url.toString(), {breakLength: Infinity})
			} whose ${propName} is ${inspect(val, {breakLength: Infinity})}.`);
			error.code = 'ERR_INVALID_ARG_VALUE';

			Error.captureStackTrace(error, replaceUrl); // eslint-disable-line no-use-before-define
			throw error;
		}
	}
}

function replaceUrl(str, ...restArgs) {
	const argLen = restArgs.length;

	if (argLen === 0) {
		const error = new RangeError('Expected 1 argument (<string|URL>), but got no arguments.');
		error.code = 'ERR_MISSING_ARGS';

		Error.captureStackTrace(error, replaceUrl);
		throw error;
	}

	if (argLen !== 1) {
		const error = new RangeError(`Expected 1 argument (<string|URL>), but got ${argLen} arguments.`);
		error.code = 'ERR_TOO_MANY_ARGS';

		Error.captureStackTrace(error, replaceUrl);
		throw error;
	}

	let [url] = restArgs;

	if (url instanceof URL) {
		invalidateHashAndSearch(url);
		url = url.toString();
	} else if (typeof url === 'string') {
		if (url.length === 0) {
			const error = new URIError(`${URL_ERROR} which must not be empty, but got '' (empty string).`);
			error.code = 'ERR_INVALID_ARG_VALUE';

			Error.captureStackTrace(error, replaceUrl);
			throw error;
		}

		invalidateHashAndSearch(new URL(url, 'http://localhost:80'));
	} else {
		const error = new TypeError(`${URL_ERROR} (<string|URL>), but got ${inspectWithKind(url)}.`);
		error.code = 'ERR_INVALID_ARG_TYPE';

		Error.captureStackTrace(error, replaceUrl);
		throw error;
	}

	try {
		decodeURI(url);
	} catch {
		const error = new URIError(`${URL_ERROR}, but received an RFC 3986 incompatible URI ${
			inspect(url, {breakLength: Infinity})
		}. In short, RFC 3986 says that a URI must be a UTF-8 sequence. https://tools.ietf.org/html/rfc3986`);
		error.code = 'ERR_INVALID_URL';

		Error.captureStackTrace(error, replaceUrl);
		throw error;
	}

	return str.replace('EVENT_SOURCE_URL', encodeURI(url));
}

module.exports = function reloaderClient(...args) {
	return replaceUrl(template, ...args);
};

Object.defineProperties(module.exports, {
	legacy: {
		enumerable: true,
		value: function reloaderClientLegacy(...args) {
			return `${polyfill};${replaceUrl(legacyTemplate, ...args)}`;
		}
	},
	DOCUMENT_RELOAD_SIGNAL: {
		enumerable: true,
		value: '0'
	},
	CSS_RELOAD_SIGNAL: {
		enumerable: true,
		value: '1'
	}
});
