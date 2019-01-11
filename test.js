'use strict';

const {createServer} = require('http');
const {join} = require('path');
const {promisify} = require('util');

const attempt = require('lodash/attempt');
const {Builder, By, until} = require('selenium-webdriver');
const ChromeOptions = require('selenium-webdriver/chrome').Options;
const {createInstrumenter} = require('istanbul-lib-instrument');
const FirefoxOptions = require('selenium-webdriver/firefox').Options;
const once = require('lodash/once');
const outputFile = require('output-file');
const pWaitFor = require('p-wait-for');
const reloaderClient = require('.');
const startCase = require('lodash/startCase');
const test = require('tape');
const uniqueId = require('lodash/uniqueId');

const coverageTmpDir = attempt(() => join(__dirname, JSON.parse(process.env.NYC_CONFIG).tempDir));

(async () => {
	let times;
	let sseRes;

	async function sendData(data, id) {
		const body = `retry:10\nid:${id}\ndata:${data}\n\n`;

		await pWaitFor(() => !!sseRes, {timeout: 2000});

		const res = sseRes;

		sseRes = null;
		res.writeHead(200, {
			'cache-control': 'no-store',
			'content-type': 'text/event-stream',
			'content-length': Buffer.byteLength(body)
		});
		await promisify(res.end.bind(res))(body);
	}

	const client = reloaderClient(new URL('http://127.0.0.1:3001/sse'));
	const legacyClient = reloaderClient.legacy('/sse');

	const tag = `<script type="module">${coverageTmpDir ? createInstrumenter({
		esModules: true
	}).instrumentSync(client, require.resolve('./client.js')) : client}</script>`;
	const legacyTag = `<script async>${legacyClient}</script>`;

	const server = createServer(({url}, res) => {
		if (url.startsWith('/sse')) {
			sseRes = res;
			return;
		}

		if (url.startsWith('/style0.css')) {
			const css = Buffer.from(`html{background-image:url(${times}${url})}`);

			res.writeHead(200, {
				'content-type': 'text/css',
				'content-length': css.length
			});

			res.end(css);
			return;
		}

		if (url.startsWith('/style1.css')) {
			const css = Buffer.from(`body{background-image:url(${times}${url})}`);

			res.writeHead(200, {
				'content-type': 'text/css',
				'content-length': css.length
			});

			res.end(css);
			return;
		}

		if (url.endsWith('.css')) {
			const body = Buffer.from('Not found');

			res.writeHead(404, {
				'content-type': 'text/plain',
				'content-length': body.length
			});

			res.end(body);
			return;
		}

		if (url !== '/favicon.ico') {
			const html = Buffer.from(`<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<title>${times++}</title>
	${url.endsWith('legacy') ? legacyTag : tag}
	<style>#this-is-inline-css{}</style>
	<link href="https://cdn.jsdelivr.net/npm/normalize.css@8.0.1/normalize.min.css" rel="stylesheet">
	<link href="/style0.css" rel="stylesheet">
	<link href="/style1.css" rel="stylesheet">
	<link href="/404.css" rel="stylesheet">
</head>
<body></body>
</html>`);

			res.writeHead(200, {
				'content-type': 'text/html',
				'content-length': html.length
			});
			res.end(html);
			return;
		}

		res.end(Buffer.alloc(0));
	});

	const [driver] = await Promise.all([
		new Builder()
		.forBrowser('firefox')
		.setChromeOptions(new ChromeOptions().headless())
		.setFirefoxOptions(new FirefoxOptions().headless())
		.build(),
		promisify(server.listen.bind(server))(3001)
	]);
	const browserName = startCase((await driver.getCapabilities()).getBrowserName());
	const cleanup = once(() => {
		driver.quit();
		server.close();
	});

	async function writeCoverage() {
		if (typeof coverageTmpDir !== 'string') {
			return;
		}

		const json = await driver.executeScript('return window.__coverage__');
		await outputFile(join(coverageTmpDir, `${browserName}${uniqueId()}.json`), JSON.stringify(json));
	}

	test.onFinish(cleanup);

	async function run(t, url) {
		times = 0;
		await driver.get(url);

		await driver.wait(until.titleIs('0'), 1000);
		await sendData(reloaderClient.DOCUMENT_RELOAD_SIGNAL, 'first');
		await writeCoverage();
		await driver.wait(until.titleIs('1'), 1000);
		t.pass('should reload the document when it receives a page reload signal.');

		await sendData('01234 invalid data 56789', 'second');
		await driver.wait(until.titleIs('1'), 1000);
		t.pass('should do nothing when it receives too long signal.');

		await sendData(String.fromCharCode(reloaderClient.CSS_RELOAD_SIGNAL.charCodeAt(0) + 1), 'third');
		await driver.wait(until.titleIs('1'), 1000);
		t.pass('should do nothing when it receives unknown signal.');

		await sendData(reloaderClient.DOCUMENT_RELOAD_SIGNAL, 'third');
		await driver.wait(until.titleIs('1'), 1000);
		t.pass('should do nothing when the received event ID equals to the previous one.');

		await sendData(reloaderClient.CSS_RELOAD_SIGNAL, 'fourth');
		await driver.wait(until.titleIs('1'), 1000);
		t.pass('should not reload the document when it receives a CSS reload signal.');

		await writeCoverage();

		const [htmlElement, bodyElement] = await driver.findElements(By.css('html,body'));
		// IEDriver throws `UnsupportedOperationError: Error 404: Not Found` error
		// when trying to call WebElement#getCssValue() in parallel
		const [htmlBackgroundImage, bodyBackgroundImage] = browserName === 'Internet Explorer' ? [
			await htmlElement.getCssValue('background-image'),
			await bodyElement.getCssValue('background-image')
		] : await Promise.all([
			htmlElement,
			bodyElement
		].map(async element => element.getCssValue('background-image')));

		t.equal(
			htmlBackgroundImage.substring(0, 53),
			process.env.TRAVIS_OS_NAME === 'osx' ? 'url(http://127.0.0.1:3001/2/style0.css?reload_timing=' : 'url("http://127.0.0.1:3001/2/style0.css?reload_timing',
			'should reload CSS when it receives a CSS reload signal.'
		);

		t.equal(
			bodyBackgroundImage.substring(0, 53),
			process.env.TRAVIS_OS_NAME === 'osx' ? 'url(http://127.0.0.1:3001/2/style1.css?reload_timing=' : 'url("http://127.0.0.1:3001/2/style1.css?reload_timing',
			'should reload multiple CSS when it receives a CSS reload signal.'
		);

		t.end();
	}

	if (browserName !== 'Edge' && browserName !== 'Internet Explorer') {
		test(`reloader-client on ${browserName}`, t => run(t, 'http://127.0.0.1:3001/'));
	}

	test(`Legacy reloader-client on ${browserName}`, t => run(t, 'http://127.0.0.1:3001/legacy'));

	test('Argument validation', async t => {
		cleanup();

		async function getError(...args) {
			try {
				return await reloaderClient(...args);
			} catch (err) {
				return err;
			}
		}

		t.equal(
			(await getError(new Uint32Array())).toString(),
			'TypeError: Expected a URL of the resource serving Server-sent events (<string|URL>), but got Uint32Array [].',
			'should fail when it takes a value neither string nor URL.'
		);

		t.equal(
			(await getError('')).toString(),
			'URIError: Expected a URL of the resource serving Server-sent events which must not be empty, but got \'\' (empty string).',
			'should fail when it takes an empty string.'
		);

		t.equal(
			(await getError(new URL('https://localhost:80/%%'))).toString(),
			'URIError: Expected a URL of the resource serving Server-sent events, ' +
			'but received an RFC 3986 incompatible URI \'https://localhost:80/%%\'. ' +
			'In short, RFC 3986 says that a URI must be a UTF-8 sequence. https://tools.ietf.org/html/rfc3986',
			'should fail when it takes an RFC-incompatible URL.'
		);

		t.equal(
			(await getError('/#a')).toString(),
			'Error: Expected URL to have no hash and search parameter, but got \'http://localhost/#a\' whose hash is \'#a\'.',
			'should fail when the URL has a hash.'
		);

		t.equal(
			(await getError(new URL('https://example.org/?x=y'))).toString(),
			'Error: Expected URL to have no hash and search parameter, but got \'https://example.org/?x=y\' whose search parameter is \'?x=y\'.',
			'should fail when the URL has a parameter.'
		);

		t.equal(
			(await getError()).toString(),
			'RangeError: Expected 1 argument (<string|URL>), but got no arguments.',
			'should fail when it takes no arguments.'
		);

		t.equal(
			(await getError('_', '_')).toString(),
			'RangeError: Expected 1 argument (<string|URL>), but got 2 arguments.',
			'should fail when it takes too many arguments.'
		);

		t.end();
	});
})();
