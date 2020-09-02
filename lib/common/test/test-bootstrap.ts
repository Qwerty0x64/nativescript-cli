import { ICliGlobal } from "../definitions/cli-global";
import { injector } from "../yok";
import * as _ from "lodash";
(<ICliGlobal>(<unknown>global))._ = _;
(<ICliGlobal>(<unknown>global)).$injector = injector;
injector.require("hostInfo", "../host-info");
injector.register("config", {});

// Our help reporting requires analyticsService. Give it this mock so that errors during test executions can be printed out
injector.register("analyticsService", {
	async checkConsent(): Promise<void> {
		return;
	},
	async trackFeature(featureName: string): Promise<void> {
		return;
	},
	async trackException(exception: any, message: string): Promise<void> {
		return;
	},
	async setStatus(settingName: string, enabled: boolean): Promise<void> {
		return;
	},
	async getStatusMessage(
		settingName: string,
		jsonFormat: boolean,
		readableSettingName: string
	): Promise<string> {
		return "Fake message";
	},
	async isEnabled(settingName: string): Promise<boolean> {
		return false;
	},
	async track(featureName: string, featureValue: string): Promise<void> {
		return;
	},
});

// Converts the js callstack to typescript
import { installUncaughtExceptionListener } from "../errors";
installUncaughtExceptionListener();
