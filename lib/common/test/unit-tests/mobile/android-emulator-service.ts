import { Yok } from "../../../yok";
import { AndroidEmulatorServices } from "../../../mobile/android/android-emulator-services";
import { EmulatorHelper } from "../../../mobile/emulator-helper";
import { assert } from "chai";
import { RUNNING_EMULATOR_STATUS } from "../../../constants";
import { DeviceConnectionType } from "../../../../constants";

function createTestInjector() {
	const testInjector = new Yok();

	testInjector.register("adb", {
		getDevicesSafe: () => Promise.resolve(),
	});
	testInjector.register("androidVirtualDeviceService", {});
	testInjector.register("androidGenymotionService", {});
	testInjector.register("androidEmulatorServices", AndroidEmulatorServices);
	testInjector.register("androidIniFileParser", {});
	testInjector.register("childProcess", {
		spawn: () => ({ unref: () => ({}), on: () => ({}) }),
	});
	testInjector.register("emulatorHelper", EmulatorHelper);
	testInjector.register("logger", { info: () => ({}) });
	testInjector.register("utils", {
		getMilliSecondsTimeout: () => ({}),
	});

	return testInjector;
}

const avdEmulatorIds = ["emulator-5554", "emulator-5556"];
const genyEmulatorIds = ["192.168.56.101:5555", "192.168.56.102:5555"];
const avdEmulatorName = "my avd emulator";
const genyEmulatorName = "my geny emulator";

const avdEmulator = {
	identifier: "emulator-5554",
	displayName: "avd name",
	model: "model",
	version: "version",
	vendor: "Avd",
	status: RUNNING_EMULATOR_STATUS,
	errorHelp: "",
	isTablet: false,
	type: "type",
	platform: "android",
	connectionTypes: [DeviceConnectionType.Local],
};

const genyEmulator = {
	identifier: "192.168.56.101:5555",
	displayName: "geny name",
	model: "model",
	version: "version",
	vendor: "Genymotion",
	status: RUNNING_EMULATOR_STATUS,
	errorHelp: "",
	isTablet: false,
	type: "type",
	connectionTypes: [DeviceConnectionType.Local],
	platform: "android",
};
const mockError = "some error occurs";

describe("androidEmulatorService", () => {
	let androidEmulatorServices: Mobile.IEmulatorPlatformService = null;
	let androidVirtualDeviceService: Mobile.IAndroidVirtualDeviceService = null;
	let androidGenymotionService: Mobile.IAndroidVirtualDeviceService = null;

	beforeEach(() => {
		const testInjector = createTestInjector();
		androidEmulatorServices = testInjector.resolve("androidEmulatorServices");
		androidVirtualDeviceService = testInjector.resolve(
			"androidVirtualDeviceService"
		);
		androidGenymotionService = testInjector.resolve("androidGenymotionService");
	});

	function mockGetEmulatorImages(
		avds: Mobile.IEmulatorImagesOutput,
		genies: Mobile.IEmulatorImagesOutput
	) {
		androidVirtualDeviceService.getEmulatorImages = () => Promise.resolve(avds);
		androidGenymotionService.getEmulatorImages = () => Promise.resolve(genies);
	}

	function mockGetRunningEmulatorIds(avds: string[], genies: string[]) {
		androidVirtualDeviceService.getRunningEmulatorIds = () =>
			Promise.resolve(avds);
		androidGenymotionService.getRunningEmulatorIds = () =>
			Promise.resolve(genies);
	}

	describe("getEmulatorImages", () => {
		it("should return [] when there are no emulators are available", async () => {
			mockGetEmulatorImages(
				{ devices: [], errors: [] },
				{ devices: [], errors: [] }
			);
			const output = await androidEmulatorServices.getEmulatorImages();
			assert.deepStrictEqual(output.devices, []);
			assert.deepStrictEqual(output.errors, []);
		});
		it("should return avd emulators when only avd emulators are available", async () => {
			mockGetEmulatorImages(
				{ devices: [avdEmulator], errors: [] },
				{ devices: [], errors: [] }
			);
			const output = await androidEmulatorServices.getEmulatorImages();
			assert.deepStrictEqual(output.devices, [avdEmulator]);
			assert.deepStrictEqual(output.errors, []);
		});
		it("should return geny emulators when only geny emulators are available", async () => {
			mockGetEmulatorImages(
				{ devices: [], errors: [] },
				{ devices: [genyEmulator], errors: [] }
			);
			const output = await androidEmulatorServices.getEmulatorImages();
			assert.deepStrictEqual(output.devices, [genyEmulator]);
			assert.deepStrictEqual(output.errors, []);
		});
		it("should return avd and geny emulators when avd and geny emulators are available", async () => {
			mockGetEmulatorImages(
				{ devices: [avdEmulator], errors: [] },
				{ devices: [genyEmulator], errors: [] }
			);
			const output = await androidEmulatorServices.getEmulatorImages();
			assert.deepStrictEqual(
				output.devices,
				[avdEmulator].concat([genyEmulator])
			);
			assert.deepStrictEqual(output.errors, []);
		});
		it("should return an error when avd error is thrown", async () => {
			mockGetEmulatorImages(
				{ devices: [], errors: [mockError] },
				{ devices: [], errors: [] }
			);
			const output = await androidEmulatorServices.getEmulatorImages();
			assert.deepStrictEqual(output.devices, []);
			assert.deepStrictEqual(output.errors, [mockError]);
		});
		it("should return an error when geny error is thrown", async () => {
			mockGetEmulatorImages(
				{ devices: [], errors: [] },
				{ devices: [], errors: [mockError] }
			);
			const output = await androidEmulatorServices.getEmulatorImages();
			assert.deepStrictEqual(output.devices, []);
			assert.deepStrictEqual(output.errors, [mockError]);
		});
		it("should return an error when avd and geny errors are thrown", async () => {
			mockGetEmulatorImages(
				{ devices: [], errors: [mockError] },
				{ devices: [], errors: [mockError] }
			);
			const output = await androidEmulatorServices.getEmulatorImages();
			assert.deepStrictEqual(output.devices, []);
			assert.deepStrictEqual(output.errors, [mockError, mockError]);
		});
	});

	describe("getRunningEmulatorIds", () => {
		it("should return [] when no running emulators", async () => {
			mockGetRunningEmulatorIds([], []);
			const emulatorIds = await androidEmulatorServices.getRunningEmulatorIds();
			assert.deepStrictEqual(emulatorIds, []);
		});
		it("should return avd emulators when only avd emulators are available", async () => {
			mockGetRunningEmulatorIds(avdEmulatorIds, []);
			const emulators = await androidEmulatorServices.getRunningEmulatorIds();
			assert.deepStrictEqual(emulators, avdEmulatorIds);
		});
		it("should return geny emulators when only geny emulators are available", async () => {
			mockGetRunningEmulatorIds([], genyEmulatorIds);
			const emulators = await androidEmulatorServices.getRunningEmulatorIds();
			assert.deepStrictEqual(emulators, genyEmulatorIds);
		});
		it("should return avd and geny emulators are available", async () => {
			mockGetRunningEmulatorIds(avdEmulatorIds, genyEmulatorIds);
			const emulators = await androidEmulatorServices.getRunningEmulatorIds();
			assert.deepStrictEqual(emulators, avdEmulatorIds.concat(genyEmulatorIds));
		});
	});

	describe("getRunningEmulatorName", () => {
		function mockGetRunningEmulatorName(data: { avd?: string; geny?: string }) {
			androidVirtualDeviceService.getRunningEmulatorName = () =>
				Promise.resolve(data.avd);
			androidGenymotionService.getRunningEmulatorName = () =>
				Promise.resolve(data.geny);
		}

		it("should return null when no emulators are available", async () => {
			mockGetRunningEmulatorName({});
			const emulatorName = await androidEmulatorServices.getRunningEmulatorName(
				""
			);
			assert.deepStrictEqual(emulatorName, undefined);
		});
		it("should return null when there are available emulators but the provided emulatorId is not found", async () => {
			mockGetRunningEmulatorName({});
			const emulatorName = await androidEmulatorServices.getRunningEmulatorName(
				"my emulator Id"
			);
			assert.deepStrictEqual(emulatorName, undefined);
		});
		it("should return avd emulator when the provided emulatorId is found", async () => {
			mockGetRunningEmulatorName({ avd: avdEmulatorName });
			const emulatorName = await androidEmulatorServices.getRunningEmulatorName(
				avdEmulatorName
			);
			assert.deepStrictEqual(emulatorName, avdEmulatorName);
		});
		it("should return geny emulator when the provided emulatorId is found", async () => {
			mockGetRunningEmulatorName({ geny: genyEmulatorName });
			const emulatorName = await androidEmulatorServices.getRunningEmulatorName(
				genyEmulatorName
			);
			assert.deepStrictEqual(emulatorName, genyEmulatorName);
		});
		it("should return avd emulator when there are avd and geny emulators", async () => {
			mockGetRunningEmulatorName({
				avd: avdEmulatorName,
				geny: genyEmulatorName,
			});
			const emulatorName = await androidEmulatorServices.getRunningEmulatorName(
				avdEmulatorName
			);
			assert.deepStrictEqual(emulatorName, avdEmulatorName);
		});
	});

	describe("startEmulator", () => {
		function mockStartEmulator(
			deviceInfo: Mobile.IDeviceInfo
		): Mobile.IDeviceInfo {
			if (deviceInfo.vendor === "Avd") {
				androidVirtualDeviceService.startEmulatorArgs = () => [];
				androidVirtualDeviceService.pathToEmulatorExecutable = "";
			} else {
				androidGenymotionService.startEmulatorArgs = () => [];
				androidGenymotionService.pathToEmulatorExecutable = "";
			}

			return deviceInfo;
		}

		it("should start avd emulator", async () => {
			mockGetRunningEmulatorIds([], []);
			mockGetEmulatorImages(
				{ devices: [avdEmulator], errors: [] },
				{ devices: [], errors: [] }
			);
			const deviceInfo = mockStartEmulator(avdEmulator);
			await androidEmulatorServices.startEmulator(avdEmulator);
			assert.deepStrictEqual(deviceInfo, avdEmulator);
		});
		it("should start geny emulator", async () => {
			mockGetRunningEmulatorIds([], []);
			mockGetEmulatorImages(
				{ devices: [], errors: [] },
				{ devices: [genyEmulator], errors: [] }
			);
			const deviceInfo = mockStartEmulator(genyEmulator);
			assert.deepStrictEqual(deviceInfo, genyEmulator);
		});
	});
});
