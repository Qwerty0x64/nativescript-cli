import { Yok } from "../../../yok";
import { assert } from "chai";
import * as _ from "lodash";
import { EventEmitter } from "events";
import { DeviceEmitter } from "../../../mobile/device-emitter";
import {
	DeviceDiscoveryEventNames,
	DEVICE_LOG_EVENT_NAME,
} from "../../../constants";
import { IInjector } from "../../../definitions/yok";
// Injector dependencies must be classes.
// EventEmitter is function, so our annotate method will fail.
class CustomEventEmitter extends EventEmitter {
	constructor() {
		super();
	}
}

function createTestInjector(): IInjector {
	const testInjector = new Yok();
	testInjector.register("devicesService", CustomEventEmitter);
	testInjector.register("deviceLogProvider", CustomEventEmitter);

	testInjector.register("deviceEmitter", DeviceEmitter);

	return testInjector;
}

describe("deviceEmitter", () => {
	let testInjector: IInjector;
	let deviceEmitter: DeviceEmitter;
	let isOpenDeviceLogStreamCalled = false;

	beforeEach(() => {
		testInjector = createTestInjector();
		deviceEmitter = testInjector.resolve("deviceEmitter");
		isOpenDeviceLogStreamCalled = false;
	});

	describe("raises correct events after initialize is called:", () => {
		let devicesService: EventEmitter;
		let deviceInstance: any;

		beforeEach(async () => {
			devicesService = testInjector.resolve("devicesService");

			deviceInstance = {
				deviceInfo: {
					identifier: "deviceId",
					platform: "android",
				},
				applicationManager: new EventEmitter(),
				openDeviceLogStream: () => (isOpenDeviceLogStreamCalled = true),
			};
		});

		_.each(
			[
				DeviceDiscoveryEventNames.DEVICE_FOUND,
				DeviceDiscoveryEventNames.DEVICE_LOST,
			],
			(deviceEvent) => {
				describe(deviceEvent, () => {
					const attachDeviceEventVerificationHandler = (
						expectedDeviceInfo: any,
						done: mocha.Done
					) => {
						deviceEmitter.on(deviceEvent, (deviceInfo: Mobile.IDeviceInfo) => {
							assert.deepStrictEqual(deviceInfo, expectedDeviceInfo);
							// Wait for all operations to be completed and call done after that.
							setTimeout(() => done(), 0);
						});
					};

					it("is raised when working with device", (done: mocha.Done) => {
						attachDeviceEventVerificationHandler(
							deviceInstance.deviceInfo,
							done
						);
						devicesService.emit(deviceEvent, deviceInstance);
					});
				});
			}
		);

		describe("openDeviceLogStream", () => {
			const attachDeviceEventVerificationHandler = (
				expectedDeviceInfo: any,
				done: mocha.Done
			) => {
				deviceEmitter.on(
					DeviceDiscoveryEventNames.DEVICE_FOUND,
					(deviceInfo: Mobile.IDeviceInfo) => {
						assert.deepStrictEqual(deviceInfo, expectedDeviceInfo);

						// Wait for all operations to be completed and call done after that.
						setTimeout(() => {
							assert.isTrue(
								isOpenDeviceLogStreamCalled,
								"When device is found, openDeviceLogStream must be called immediately."
							);
							done();
						}, 0);
					}
				);
			};

			it("is called when working with device", (done: mocha.Done) => {
				attachDeviceEventVerificationHandler(deviceInstance.deviceInfo, done);
				devicesService.emit(
					DeviceDiscoveryEventNames.DEVICE_FOUND,
					deviceInstance
				);
			});
		});

		describe("deviceLogProvider on data", () => {
			let deviceLogProvider: EventEmitter;

			beforeEach(() => {
				deviceLogProvider = testInjector.resolve("deviceLogProvider");
			});

			describe(`raises ${DEVICE_LOG_EVENT_NAME} with correct identifier and data`, () => {
				const expectedDeviceLogData = "This is some log data from device.";

				const attachDeviceLogDataVerificationHandler = (
					expectedDeviceIdentifier: string,
					done: mocha.Done
				) => {
					deviceEmitter.on(
						DEVICE_LOG_EVENT_NAME,
						(identifier: string, data: any) => {
							assert.deepStrictEqual(identifier, expectedDeviceIdentifier);
							assert.deepStrictEqual(data, expectedDeviceLogData);
							// Wait for all operations to be completed and call done after that.
							setTimeout(() => done(), 0);
						}
					);
				};

				it("is called when device reports data", (done: mocha.Done) => {
					attachDeviceLogDataVerificationHandler(
						deviceInstance.deviceInfo.identifier,
						done
					);
					devicesService.emit(
						DeviceDiscoveryEventNames.DEVICE_FOUND,
						deviceInstance
					);
					deviceLogProvider.emit(
						"data",
						deviceInstance.deviceInfo.identifier,
						expectedDeviceLogData
					);
				});
			});
		});

		_.each(
			["applicationInstalled", "applicationUninstalled"],
			(applicationEvent: string) => {
				describe(applicationEvent, () => {
					const expectedApplicationIdentifier = "application identifier";

					const attachApplicationEventVerificationHandler = (
						expectedDeviceIdentifier: string,
						done: mocha.Done
					) => {
						deviceEmitter.on(
							applicationEvent,
							(deviceIdentifier: string, appIdentifier: string) => {
								assert.deepStrictEqual(
									deviceIdentifier,
									expectedDeviceIdentifier
								);
								assert.deepStrictEqual(
									appIdentifier,
									expectedApplicationIdentifier
								);

								// Wait for all operations to be completed and call done after that.
								setTimeout(() => done(), 0);
							}
						);
					};

					it("is raised when working with device", (done: mocha.Done) => {
						attachApplicationEventVerificationHandler(
							deviceInstance.deviceInfo.identifier,
							done
						);
						devicesService.emit(
							DeviceDiscoveryEventNames.DEVICE_FOUND,
							deviceInstance
						);
						deviceInstance.applicationManager.emit(
							applicationEvent,
							expectedApplicationIdentifier
						);
					});
				});
			}
		);

		_.each(
			["debuggableAppFound", "debuggableAppLost"],
			(applicationEvent: string) => {
				describe(applicationEvent, () => {
					const attachDebuggableEventVerificationHandler = (
						expectedDebuggableAppInfo: Mobile.IDeviceApplicationInformation,
						done: mocha.Done
					) => {
						deviceEmitter.on(
							applicationEvent,
							(debuggableAppInfo: Mobile.IDeviceApplicationInformation) => {
								assert.deepStrictEqual(
									debuggableAppInfo,
									expectedDebuggableAppInfo
								);

								// Wait for all operations to be completed and call done after that.
								setTimeout(() => done(), 0);
							}
						);
					};

					it("is raised when working with device", (done: mocha.Done) => {
						const debuggableAppInfo: Mobile.IDeviceApplicationInformation = {
							appIdentifier: "app identifier",
							deviceIdentifier: deviceInstance.deviceInfo.identifier,
							framework: "cordova",
						};

						attachDebuggableEventVerificationHandler(debuggableAppInfo, done);
						devicesService.emit(
							DeviceDiscoveryEventNames.DEVICE_FOUND,
							deviceInstance
						);
						deviceInstance.applicationManager.emit(
							applicationEvent,
							debuggableAppInfo
						);
					});
				});
			}
		);

		_.each(
			["debuggableViewFound", "debuggableViewLost", "debuggableViewChanged"],
			(applicationEvent: string) => {
				describe(applicationEvent, () => {
					const createDebuggableWebView = (uniqueId: string) => {
						return {
							description: `description_${uniqueId}`,
							devtoolsFrontendUrl: `devtoolsFrontendUrl_${uniqueId}`,
							id: `${uniqueId}`,
							title: `title_${uniqueId}`,
							type: `type_${uniqueId}`,
							url: `url_${uniqueId}`,
							webSocketDebuggerUrl: `webSocketDebuggerUrl_${uniqueId}`,
						};
					};

					const appId = "appId";

					const attachDebuggableEventVerificationHandler = (
						expectedDeviceIdentifier: string,
						expectedAppIdentifier: string,
						expectedDebuggableViewInfo: Mobile.IDebugWebViewInfo,
						done: mocha.Done
					) => {
						deviceEmitter.on(
							applicationEvent,
							(
								deviceIdentifier: string,
								appIdentifier: string,
								debuggableViewInfo: Mobile.IDebugWebViewInfo
							) => {
								assert.deepStrictEqual(
									deviceIdentifier,
									expectedDeviceIdentifier
								);

								assert.deepStrictEqual(appIdentifier, expectedAppIdentifier);

								assert.deepStrictEqual(
									debuggableViewInfo,
									expectedDebuggableViewInfo
								);

								// Wait for all operations to be completed and call done after that.
								setTimeout(done, 0);
							}
						);
					};

					it("is raised when working with device", (done: mocha.Done) => {
						const expectedDebuggableViewInfo: Mobile.IDebugWebViewInfo = createDebuggableWebView(
							"test1"
						);

						attachDebuggableEventVerificationHandler(
							deviceInstance.deviceInfo.identifier,
							appId,
							expectedDebuggableViewInfo,
							done
						);
						devicesService.emit(
							DeviceDiscoveryEventNames.DEVICE_FOUND,
							deviceInstance
						);
						deviceInstance.applicationManager.emit(
							applicationEvent,
							appId,
							expectedDebuggableViewInfo
						);
					});
				});
			}
		);
	});
});
