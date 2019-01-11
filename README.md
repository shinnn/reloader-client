# reloader-client

[![npm version](https://img.shields.io/npm/v/reloader-client.svg)](https://www.npmjs.com/package/reloader-client)
[![Build Status](https://travis-ci.com/shinnn/reloader-client.svg?branch=master)](https://travis-ci.com/shinnn/reloader-client)
[![Build status](https://ci.appveyor.com/api/projects/status/bdxdddtr0dnx8run/branch/master?svg=true)](https://ci.appveyor.com/project/ShinnosukeWatanabe/reloader-client/branch/master)
[![codecov](https://codecov.io/gh/shinnn/reloader-client/branch/master/graph/badge.svg)](https://codecov.io/gh/shinnn/reloader-client)

A [Node.js](https://nodejs.org/) module to generate a script to reload the current page or its styles in response to [server-sent events](https://developer.mozilla.org/docs/Web/API/Server-sent_events)

## Installation

[Use](https://docs.npmjs.com/cli/install) [npm](https://docs.npmjs.com/about-npm/).

```
npm install --save-dev reloader-client
```

## API

```javascript
const reloaderClient = require('reloader-client');
```

### reloaderClient(*url*)

*url*: `string` `URL` (an absolute or relative URL)  
Return: `string`

It returns a client-side JavaScript code that does the followings:

1. [Open a connection](https://developer.mozilla.org/en-US/docs/Web/API/EventSource/EventSource) to the server at a given `url` to receive [events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#Event_stream_format) from it.
2. When the script receives an event from the server,
  * Reload the current page if the event `data` equals to [`DOCUMENT_RELOAD_SIGNAL`][drs].
  * Reload stylesheets without reloading the current page if the event `data` equals to [`CSS_RELOAD_SIGNAL`][crs].

### reloaderClient.legacy(*url*)

*url*: `string` `URL`  
Return: `string`

It essentially does the same thing as `reloaderClient()` does, but returns a script that is compatible with [Edge](https://microsoft.com/microsoft-edge) and [Internet Explorer](https://support.microsoft.com/hub/4230784/internet-explorer-help), neither of whom supports [`EventSource` API](https://developer.mozilla.org/en-US/docs/Web/API/EventSource).

### reloaderClient.DOCUMENT_RELOAD_SIGNAL

Type: `string`

### reloaderClient.CSS_RELOAD_SIGNAL

Type: `string`

## Usage

__1.__ Generate a script with `reloaderClient()` (or with `reloaderClient.legacy()` for Microsoft browsers).

```
$ node -p "require('reloader-client')('/sse-url')"
> const KEY = 'reloader-client-last-reload-event-id' ...
```

__2.__ Include a generated script to an HTML and serve it in a server.

```html
<head>
  <script>/* ... paste the generated code here ... */</script>
</head>
```

__3.__ Whenever a reload should be performed, [send an event](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#Sending_events_from_the_server) to the client in the following form:

```
id: <any>
data: <reloaderClient.DOCUMENT_RELOAD_SIGNAL|reloaderClient.CSS_RELOAD_SIGNAL>
```

* `data` must equal to either [`reloaderClient.DOCUMENT_RELOAD_SIGNAL`][drs] or [`reloaderClient.CSS_RELOAD_SIGNAL`][crs].
* `id` must be different from the previous event's.

## License

[ISC License](./LICENSE) © 2019 Shinnosuke Watanabe

[drs]: #reloaderclientdocument_reload_signal
[crs]: #reloaderclientcss_reload_signal
