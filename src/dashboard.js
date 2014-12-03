(function($) {
"use strict";

if (Echo.AppServer.Dashboard.isDefined("Echo.Apps.ContentVelocity.Dashboard")) return;

var dashboard = Echo.AppServer.Dashboard.manifest("Echo.Apps.ContentVelocity.Dashboard");

dashboard.inherits = Echo.Utils.getComponent("Echo.AppServer.Dashboards.AppSettings");

dashboard.mappings = {
	"dependencies.appkey": {
		"key": "dependencies.StreamServer.appkey"
	}
};

dashboard.dependencies = [{
	"url": "{config:cdnBaseURL.apps.appserver}/controls/configurator.js",
	"control": "Echo.AppServer.Controls.Configurator"
}, {
	"url": "{config:cdnBaseURL.apps.dataserver}/dashboards.pack.js",
	"control": "Echo.DataServer.Controls.Pack"
}, {
	"url": "//cdn.echoenabled.com/apps/echo/social-map/v1/slider.js"
}, {
	"url": "//cdn.echoenabled.com/apps/echo/social-map/v1/colorpicker.js"
}];

dashboard.config.ecl = [{
	"component": "Group",
	"name": "presentation",
	"type": "object",
	"config": {
		"title": "Presentation"
	},
	"items": [{
		"component": "Checkbox",
		"name": "gauge",
		"type": "boolean",
		"default": true,
		"config": {
			"title": "Display gauge",
			"desc": "If true, a visual gauge will be displayed"
		}
	}, {
		"component": "Colorpicker",
		"name": "pointerColor",
		"type": "string",
		"default": "#000000",
		"config": {
			"title": "Gauge needle color",
			"desc": "Specifies the color of the gauge needle",
			"data": {"sample": "#000000"}
		}
	}, {
		"component": "Colorpicker",
		"name": "gaugeActiveColor",
		"type": "string",
		"default": "#8FC0DA",
		"config": {
			"title": "Gauge fill color",
			"desc": "Specifies the color used to fill the gauge",
			"data": {"sample": "#8FC0DA"}
		}
	}, {
		"component": "Colorpicker",
		"name": "gaugeBackgroundColor",
		"type": "string",
		"default": "#E0E0E0",
		"config": {
			"title": "Gauge background color",
			"desc": "Specifies the background color of the gauge",
			"data": {"sample": "#E0E0E0"}
		}
	}, {
		"component": "Slider",
		"name": "maxWidth",
		"type": "number",
		"default": 300,
		"config": {
			"title": "Maximum width",
			"desc": "Specifies a maximum width (in pixels) of an App container",
			"min": 100,
			"max": 500,
			"step": 10,
			"unit": "px"
		}
	}]
}, {
	"component": "Group",
	"name": "dependencies",
	"type": "object",
	"config": {
		"title": "Dependencies",
		"expanded": false
	},
	"items": [{
		"component": "Select",
		"name": "appkey",
		"type": "string",
		"config": {
			"title": "StreamServer application key",
			"desc": "Specifies the application key for this instance",
			"options": []
		}
	}]
}, {
	"name": "targetURL",
	"component": "Echo.DataServer.Controls.Dashboard.DataSourceGroup",
	"type": "string",
	"required": true,
	"config": {
		"title": "",
		"expanded": false,
		"labels": {
			"dataserverBundleName": "Echo Historical Volume Auto-Generated Bundle for {instanceName}"
		},
		"apiBaseURLs": {
			"DataServer": "{%= apiBaseURLs.DataServer %}/"
		}
	}
}];

dashboard.modifiers = {
	"dependencies.appkey": {
		"endpoint": "customer/{self:user.getCustomerId}/appkeys",
		"processor": function() {
			return this.getAppkey.apply(this, arguments);
		}
	},
	"targetURL": {
		"endpoint": "customer/{self:user.getCustomerId}/subscriptions",
		"processor": function() {
			return this.getBundleTargetURL.apply(this, arguments);
		}
	}
};

dashboard.init = function() {
	this.parent();
};

Echo.AppServer.Dashboard.create(dashboard);

})(Echo.jQuery);
