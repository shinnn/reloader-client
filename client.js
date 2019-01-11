const KEY = 'reloader-client-last-reload-event-id';
const eventSource = new EventSource('EVENT_SOURCE_URL');

eventSource.onmessage = ({data, lastEventId}) => {
	if (sessionStorage.getItem(KEY) === lastEventId) {
		return;
	}

	sessionStorage.setItem(KEY, lastEventId);

	if (data.length !== 1) {
		return;
	}

	const code = data.charCodeAt(0);

	if (code === 48) {
		eventSource.onmessage = null;
		location.reload(true);

		return;
	}

	if (code !== 49) {
		return;
	}

	// Firefox 63.0.3 causes infinite loop when `document.styleSheets` is not arrayified
	for (const {href, ownerNode} of [...document.styleSheets]) {
		if (!(ownerNode && href)) {
			continue;
		}

		const url = new URL(href);

		if (url.host !== location.host) {
			continue;
		}

		url.searchParams.set('reload_timing', performance.now());
		ownerNode.href = url.toString();
	}
};
