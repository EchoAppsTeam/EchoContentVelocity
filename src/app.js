(function($) {
"use strict";

var velocity = Echo.App.manifest("Echo.Apps.ContentVelocity");

if (Echo.App.isDefined(velocity)) return;

velocity.vars = {
	"gauge": undefined,
	"period": undefined,
	"visible": true,
	"velocity": undefined,
	"watchers": {}
};

velocity.config = {
	"targetURL": undefined,
	"defaultMaxValue": 20,

	// amount of items to retrieve from StreamServer
	// 100 is the limitation on the amount of root items
	"maxItemsToRetrieve": 100,

	// amount of intervals to split the data into
	// in order to calculate the average velocity
	// within the last X intervals
	"maxIntervals": 10,

	"presentation": {
		"gauge": true,
		"maxWidth": 300, // in px
		"pointerColor": "#000000",
		"gaugeActiveColor": "#8FC0DA",    // gauge active color
		"gaugeBackgroundColor": "#E0E0E0" // gauge background color
	},
	"gauge": {
		"angle": 0.15,     // length of each line
		"lineWidth": 0.44, // line thickness
		"pointer": {
			"length": 0.75,      // radius of the inner circle
			"strokeWidth": 0.035 // rotation offset
		}
	},
	"dependencies": {
		"StreamServer": {
			"appkey": undefined,
			"apiBaseURL": "{%= apiBaseURLs.StreamServer.basic %}/",
			"liveUpdates": {
				"transport": "websockets",
				"enabled": true,
				"websockets": {
					"URL": "{%= apiBaseURLs.StreamServer.ws %}/"
				}
			}
		}
	}
};

velocity.labels = {
	"per_min": "per minute",
	"per_hour": "per hour",
	"per_day": "per day",
	"per_month": "per month",
	"per_year": "per year"
};

velocity.dependencies = [{
	"url": "{config:cdnBaseURL.sdk}/api.pack.js",
	"control": "Echo.StreamServer.API"
}, {
	"url": "{%= appBaseURLs.prod %}/third-party/gauge.min.js",
	"loaded": function() { return !!window.Gauge; }
}];

velocity.init = function() {
	var app = this;

	// check for "targetURL" field, without
	// this field we are unable to retrieve any data
	if (!this.config.get("targetURL")) {
		this.showMessage({
			"type": "error",
			"message": "Unable to retrieve data, target URL is not specified."
		});
		return;
	}

	// spin up document visibility watcher to stop
	// gauge rendering in case a page is not active
	var watcher = app._createDocumentVisibilityWatcher();
	if (watcher) {
		watcher.start(function() {
			app.set("visible", true);
			app.refresh();
		}, function() {
			app.set("visible", false);
		});
		app.set("watchers.visibility", watcher);
	}

	// we deliberately define "itemsSeen" here, since we need
	// to preserve through the app "refresh" function call, placing
	// it into "vars" will nullify the value
	if (!app.get("itemsSeen")) {
		app.set("itemsSeen", {});
	}

	app.request = app._getRequestObject();

	var data = app.get("data");
	if ($.isEmptyObject(data)) {
		app.request.send();
	} else {
		app._getHandlerFor("onData")(data);
		app.request.send({
			"skipInitialRequest": true,
			"data": {
				"q": app._assembleQuery(),
				"appkey": app.config.get("dependencies.StreamServer.appkey"),
				"since": data.nextSince
			}
		});
	}
};

velocity.destroy = function() {
	$.each(this.get("watchers"), function(_, watcher) {
		watcher.stop();
	});
};

velocity.templates.main =
	'<div class="{class:container}">' +
		'<canvas class="{class:gauge}"></canvas>' +
		'<div class="{class:stats}">' +
			'<div class="{class:count}"></div>' +
			'<div class="{class:unit}"></div>' +
		'</div>' +
	'</div>';

velocity.renderers.container = function(element) {
	return element.css({
		"max-width": parseInt(this.config.get("presentation.maxWidth") + "px")
	});
};

velocity.renderers.count = function(element) {
	return element.text(this.get("velocity.avg"));
};

velocity.renderers.unit = function(element) {
	return element.text(this.labels.get("per_" + this.get("period.type")));
};

velocity.renderers.gauge = function(element) {
	if (!this.config.get("presentation.gauge")) {
		element.hide();
	}
	return element;
};

velocity.methods._initGauge = function(target) {
	var velocity = this.get("velocity");
	var presentation = this.config.get("presentation");
	var opts = $.extend(true, {}, this.config.get("gauge"), {
		"pointer": {
			"color": presentation.pointerColor
		},
		"colorStop": presentation.gaugeActiveColor,
		"strokeColor": presentation.gaugeBackgroundColor
	});
	var gauge = new window.Gauge(target.get(0)).setOptions(opts);

	// set max gauge value,
	// we multiply by 10 since Gauge lib doesn't like floats
	gauge.maxValue = velocity.max * 10;

	// set actual gauge value,
	// if it's 0, we use non-zero number to let the Gauge
	// library know that we want needle to be rendered (if value is 0
	// no needle is rendered)
	gauge.set(velocity.avg * 10 || 0.1);

	return gauge;
};

velocity.methods._now = function() {
	return Math.round((new Date()).getTime() / 1000);
};

velocity.methods._normalizeEntry = function(entry) {
	if (!entry.timestamp) {
		entry.timestamp = Echo.Utils.timestampFromW3CDTF(entry.object.published);
	}
	return entry;
};

velocity.methods._calculateCurrentVelocity = function() {
	var app = this;
	var now = this._now();
	var period = this.get("period");
	var maxIntervals = this.config.get("maxIntervals");
	var intervals = new Array(maxIntervals);
	var itemsSeen = this.get("itemsSeen");
	$.each(this.config.get("data.entries", []), function(_, entry) {
		entry = app._normalizeEntry(entry);
		// if item is within the last "maxIntervals" periods...
		var diff = now - entry.timestamp;
		if (diff < maxIntervals * period.interval) {
			var id = Math.round(diff / period.interval);
			intervals[id] = intervals[id] ? intervals[id] + 1 : 1;
			itemsSeen[entry.object.id] = true;
		}
	});

	// we split the data set into intervals and count
	// amount of items in each interval. After that we
	// remove empty intervals from the tail (in case the data
	// resides very compact) and calculate the average velocity
	var nonEmptyIntervalSeen = false;
	var velocity = Echo.Utils.foldl(
		{"sum": 0, "max": 0, "intervals": 0},
		intervals.reverse(),
		function(interval, acc) {
			if (interval || nonEmptyIntervalSeen) {
				if (interval) {
					nonEmptyIntervalSeen = true;
				}
				acc.sum = acc.sum + (interval || 0);
				acc.intervals += 1;
				if (acc.max < interval) {
					acc.max = interval;
				}
			}
		}
	);

	// preserve existing "max" value to avoid gauge rerendering
	if (!this.get("velocity.max")) {
		this.set("velocity.max", velocity.max || this.config.get("defaultMaxValue"));
	}

	this.set("velocity.avg", (velocity.sum / (velocity.intervals || 1)).toFixed(1));
};

velocity.methods._updateVelocityInfo = function() {
	if (!this.get("visible")) return;

	this._calculateCurrentVelocity();
	if (this.get("gauge")) {
		var velocity = this.get("velocity");
		this.get("gauge").set(Math.min(velocity.avg, velocity.max) * 10);
	}
	this.view.render({"name": "count"});
};

velocity.methods._getPeriodResolutionType = function() {
	var avg = 0;
	var entries = this.config.get("data.entries");
	if (entries.length) {
		var lastEntry = this._normalizeEntry(entries[entries.length - 1]);
		avg = (this._now() - lastEntry.timestamp) / 2;
	}

	if (avg < 60 * 60) {
		return {"type": "min", "interval": 60};
	}
	if (avg < 60 * 60 * 24) {
		return {"type": "hour", "interval": 60 * 60};
	}
	if (avg < 60 * 60 * 24 * 7) {
		return {"type": "day", "interval": 60 * 60 * 24};
	}
	if (avg < 60 * 60 * 24 * 365) {
		return {"type": "month", "interval": 60 * 60 * 24 * 30};
	}
	return {"type": "year", "interval": 60 * 60 * 24 * 365};
};

velocity.methods._assembleQuery = function() {
	var query = "scope:{config:targetURL} sortOrder:reverseChronological " +
		"itemsPerPage:{config:maxItemsToRetrieve} children:0";
	return this.substitute({"template": query});
};

velocity.methods._getRequestObject = function() {
	var ssConfig = this.config.get("dependencies.StreamServer");
	return Echo.StreamServer.API.request({
		"endpoint": "search",
		"apiBaseURL": ssConfig.apiBaseURL,
		"data": {
			"q": this._assembleQuery(),
			"appkey": ssConfig.appkey
		},
		"liveUpdates": $.extend(ssConfig.liveUpdates, {
			"onData": this._getHandlerFor("onUpdate")
		}),
		"onError": this._getHandlerFor("onError"),
		"onData": this._getHandlerFor("onData")
	});
};

// the goal of this function is to make sure that we update
// gauge even in case we do not receive live updates for any reason
velocity.methods._createUpdateWatcher = function() {
	var app = this;
	var timeout;
	var start = function() {
		timeout = setTimeout(function() {
			app._updateVelocityInfo();
			start();
		}, app.get("period.interval") * 1000);
	};
	return {
		"start": start,
		"stop": function() {
			clearTimeout(timeout);
		}
	};
};

// maybe move to Echo.Utils later...
// note: the same function is located within Echo Historical Volume app!
// inspired by http://www.html5rocks.com/en/tutorials/pagevisibility/intro/
velocity.methods._createDocumentVisibilityWatcher = function() {
	var prefix, handler;

	// if "hidden" is natively supported just return it
	if ("hidden" in document) {
		prefix = ""; // non-prefixed, i.e. natively supported
	} else {
		var prefixes = ["webkit", "moz", "ms", "o"];
		for (var i = 0; i < prefixes.length; i++) {
			if ((prefixes[i] + "Hidden") in document) {
				prefix = prefixes[i] + "Hidden";
				break;
			}
		}
	}

	// we were unable to locate "hidden" property,
	// which means this functionality is not supported
	if (prefix === undefined) return;

	var eventName = prefix + "visibilitychange";
	return {
		"start": function(onShow, onHide) {
			handler = function() {
				document[prefix ? prefix + "Hidden" : "hidden"]
					? onHide()
					: onShow();
			};
			$(document).on(eventName, handler);
		},
		"stop": function() {
			$(document).off(eventName, handler);
		}
	};
};

velocity.methods._getHandlerFor = function(name) {
	return $.proxy(this.handlers[name], this);
};

velocity.methods.handlers = {};

velocity.methods.handlers.onData = function(data) {
	// store initial data in the config as well,
	// so that we can access it later to refresh the gauge
	if ($.isEmptyObject(this.config.get("data"))) {
		this.config.set("data", data);
	}

	// preserve period resolution time
	if (!this.get("period")) {
		this.set("period", this._getPeriodResolutionType());
	}

	this.set("watchers.update", this._createUpdateWatcher());
	this.get("watchers.update").start();

	this._calculateCurrentVelocity();

	this.render();

	// we init gauge *only* after a target is placed into DOM
	if (this.config.get("presentation.gauge")) {
		this.set("gauge", this._initGauge(this.view.get("gauge")));
	}

	this.ready();
};

velocity.methods.handlers.onUpdate = function(data) {
	if (data && data.entries) {
		var max = this.config.get("maxItemsToRetrieve");
		var itemsSeen = this.get("itemsSeen");
		var oldEntries = this.config.get("data.entries", []);
		var newEntries = $.grep(data.entries, function(entry) {
			if (!itemsSeen[entry.object.id] &&
				entry.verbs[0] === "http://activitystrea.ms/schema/1.0/post") {
					itemsSeen[entry.object.id] = true;
					return true;
			}
			return false;
		});
		data.entries = newEntries.concat(oldEntries).slice(0, max);
		this.config.set("data", data);
	}
	this._updateVelocityInfo();
};

velocity.methods.handlers.onError = function(data, options) {
	var isCriticalError =
		typeof options.critical === "undefined" ||
		options.critical && options.requestType === "initial";

	if (isCriticalError) {
		this.showError(data, $.extend(options, {
			"request": this.request
		}));
	}
};

velocity.css =
	'.{class:stats} {font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; }' +
	'.{class:count} { text-align: center; font-size: 50px; }' +
	'.{class:unit} { text-align: center; font-size: 14px; }' +
	'.{class:container} { margin: 0px auto 10px; }' +
	'.{class:gauge} { width: 100%; }';

Echo.App.create(velocity);

})(Echo.jQuery);
