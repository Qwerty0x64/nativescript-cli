import * as path from "path";
import * as semver from "semver";
import * as constants from "../constants";
import * as glob from "glob";
import * as _ from "lodash";
import { UpdateControllerBase } from "./update-controller-base";
import { fromWindowsRelativePathToUnix, getHash } from "../common/helpers";
import {
	IProjectDataService,
	IProjectData,
	IProjectConfigService,
} from "../definitions/project";
import {
	IMigrateController,
	IMigrationDependency,
	IMigrationData,
} from "../definitions/migrate";
import {
	IPlatformCommandHelper,
	IPackageInstallationManager,
	IPackageManager,
	// IAndroidResourcesMigrationService,
	IPlatformValidationService,
	IOptions,
} from "../declarations";
import {
	IPlatformsDataService,
	IAddPlatformService,
} from "../definitions/platform";
import { IPluginsService } from "../definitions/plugins";
import {
	IFileSystem,
	IErrors,
	ISettingsService,
	IResourceLoader,
	IDictionary,
} from "../common/declarations";
import { IInjector } from "../common/definitions/yok";
import { injector } from "../common/yok";
import { IJsonFileSettingsService } from "../common/definitions/json-file-settings-service";
// import { project } from "nativescript-dev-xcode";

export class MigrateController
	extends UpdateControllerBase
	implements IMigrateController {
	private static COMMON_MIGRATE_MESSAGE =
		"not affect the codebase of the application and you might need to do additional changes manually – for more information, refer to the instructions in the following blog post: https://www.nativescript.org/blog/nativescript-6.0-application-migration";
	private static UNABLE_TO_MIGRATE_APP_ERROR = `The current application is not compatible with NativeScript CLI 7.0.
Use the \`ns migrate\` command to migrate the app dependencies to a form compatible with NativeScript 7.0.
Running this command will ${MigrateController.COMMON_MIGRATE_MESSAGE}`;
	private static MIGRATE_FINISH_MESSAGE = `The \`tns migrate\` command does ${MigrateController.COMMON_MIGRATE_MESSAGE}`;

	constructor(
		protected $fs: IFileSystem,
		protected $platformCommandHelper: IPlatformCommandHelper,
		protected $platformsDataService: IPlatformsDataService,
		protected $packageInstallationManager: IPackageInstallationManager,
		protected $packageManager: IPackageManager,
		protected $pacoteService: IPacoteService,
		// private $androidResourcesMigrationService: IAndroidResourcesMigrationService,
		private $devicePlatformsConstants: Mobile.IDevicePlatformsConstants,
		private $logger: ILogger,
		private $errors: IErrors,
		private $addPlatformService: IAddPlatformService,
		private $pluginsService: IPluginsService,
		private $projectDataService: IProjectDataService,
		private $projectConfigService: IProjectConfigService,
		private $options: IOptions,
		private $platformValidationService: IPlatformValidationService,
		private $resources: IResourceLoader,
		private $injector: IInjector,
		private $settingsService: ISettingsService,
		private $staticConfig: Config.IStaticConfig,
		private $terminalSpinnerService: ITerminalSpinnerService
	) {
		super(
			$fs,
			$platformCommandHelper,
			$platformsDataService,
			$packageInstallationManager,
			$packageManager,
			$pacoteService
		);
	}

	static readonly typescriptPackageName: string = "typescript";
	static readonly backupFolder: string = ".migration_backup";
	static readonly migrateFailMessage: string = "Could not migrate the project!";
	static readonly backupFailMessage: string =
		"Could not backup project folders!";

	static readonly folders: string[] = [
		constants.LIB_DIR_NAME,
		constants.HOOKS_DIR_NAME,
		constants.WEBPACK_CONFIG_NAME,
		constants.PACKAGE_JSON_FILE_NAME,
		constants.PACKAGE_LOCK_JSON_FILE_NAME,
		constants.TSCCONFIG_TNS_JSON_NAME,
		constants.KARMA_CONFIG_NAME,
		constants.CONFIG_NS_FILE_NAME,
	];

	private spinner: ITerminalSpinner;

	private get $jsonFileSettingsService(): IJsonFileSettingsService {
		const cliVersion = semver.coerce(this.$staticConfig.version);
		const shouldMigrateCacheFilePath = path.join(
			this.$settingsService.getProfileDir(),
			`should-migrate-cache-${cliVersion}.json`
		);
		return this.$injector.resolve("jsonFileSettingsService", {
			jsonFileSettingsPath: shouldMigrateCacheFilePath,
		});
	}

	private migrationDependencies: IMigrationDependency[] = [
		{
			packageName: constants.SCOPED_TNS_CORE_MODULES,
			verifiedVersion: "7.0.0",
			shouldAddIfMissing: true,
		},
		{
			packageName: constants.TNS_CORE_MODULES_NAME,
			shouldRemove: true,
		},
		{
			packageName: "@nativescript/types",
			verifiedVersion: "7.0.0",
			isDev: true,
		},
		{
			packageName: "tns-platform-declarations",
			replaceWith: "@nativescript/types",
			verifiedVersion: "7.0.0",
			isDev: true,
		},
		{
			packageName: constants.TNS_CORE_MODULES_WIDGETS_NAME,
			shouldRemove: true,
		},
		{
			packageName: "nativescript-dev-webpack",
			shouldRemove: true,
		},
		{
			packageName: constants.WEBPACK_PLUGIN_NAME,
			verifiedVersion: "3.0.0",
			shouldAddIfMissing: true,
			isDev: true,
		},
		{
			packageName: "nativescript-vue",
			verifiedVersion: "2.8.0",
			shouldMigrateAction: async (
				projectData: IProjectData,
				allowInvalidVersions: boolean
			) => {
				const dependency = {
					packageName: "nativescript-vue",
					verifiedVersion: "2.8.0",
					isDev: false,
				};
				const result =
					this.hasDependency(dependency, projectData) &&
					(await this.shouldMigrateDependencyVersion(
						dependency,
						projectData,
						allowInvalidVersions
					));
				return result;
			},
			migrateAction: this.migrateNativeScriptVue.bind(this),
		},
		{
			packageName: "nativescript-angular",
			replaceWith: "@nativescript/angular",
			verifiedVersion: "10.0.0",
		},
		{
			packageName: "@nativescript/angular",
			verifiedVersion: "10.0.0",
			shouldMigrateAction: async (
				projectData: IProjectData,
				allowInvalidVersions: boolean
			) => {
				const dependency = {
					packageName: "@nativescript/angular",
					verifiedVersion: "10.0.0",
					isDev: false,
				};
				const result =
					this.hasDependency(dependency, projectData) &&
					(await this.shouldMigrateDependencyVersion(
						dependency,
						projectData,
						allowInvalidVersions
					));
				return result;
			},
			migrateAction: this.migrateNativeScriptAngular.bind(this),
		},
		{
			packageName: "@nativescript/unit-test-runner",
			verifiedVersion: "1.0.0",
			shouldMigrateAction: async (
				projectData: IProjectData,
				allowInvalidVersions: boolean
			) => {
				const dependency = {
					packageName: "@nativescript/unit-test-runner",
					verifiedVersion: "1.0.0",
					isDev: false,
				};
				const result =
					this.hasDependency(dependency, projectData) &&
					(await this.shouldMigrateDependencyVersion(
						dependency,
						projectData,
						allowInvalidVersions
					));
				return result;
			},
			migrateAction: this.migrateUnitTestRunner.bind(this),
		},
		{
			packageName: MigrateController.typescriptPackageName,
			isDev: true,
			verifiedVersion: "3.9.7",
		},
	];

	get verifiedPlatformVersions(): IDictionary<string> {
		return {
			[this.$devicePlatformsConstants.Android.toLowerCase()]: "6.5.3",
			[this.$devicePlatformsConstants.iOS.toLowerCase()]: "6.5.2",
		};
	}

	public async migrate({
		projectDir,
		platforms,
		allowInvalidVersions = false,
	}: IMigrationData): Promise<void> {
		this.spinner = this.$terminalSpinnerService.createSpinner();

		this.spinner.start("Migrating project...");
		const projectData = this.$projectDataService.getProjectData(projectDir);
		const backupDir = path.join(projectDir, MigrateController.backupFolder);

		try {
			this.spinner.start("Backup project configuration.");
			this.backup(
				[
					...MigrateController.folders,
					path.join(projectData.getAppDirectoryRelativePath(), "package.json"),
				],
				backupDir,
				projectData.projectDir
			);
			this.spinner.text = "Backup project configuration complete.";
			this.spinner.succeed();
		} catch (error) {
			this.spinner.text = MigrateController.backupFailMessage;
			this.spinner.fail();
			// this.$logger.error(MigrateController.backupFailMessage);
			this.$fs.deleteDirectory(backupDir);
			return;
		}

		try {
			this.spinner.start("Clean auto-generated files.");
			this.handleAutoGeneratedFiles(backupDir, projectData);
			this.spinner.text = "Clean auto-generated files complete.";
			this.spinner.succeed();
		} catch (error) {
			this.$logger.trace(
				`Error during auto-generated files handling. ${
					(error && error.message) || error
				}`
			);
		}

		// await this.migrateOldAndroidAppResources(projectData, backupDir);

		try {
			await this.cleanUpProject(projectData);
			await this.migrateConfig(projectData);
			await this.migrateDependencies(
				projectData,
				platforms,
				allowInvalidVersions
			);
		} catch (error) {
			const backupFolders = MigrateController.folders;
			const embeddedPackagePath = path.join(
				projectData.getAppDirectoryRelativePath(),
				"package.json"
			);
			backupFolders.push(embeddedPackagePath);
			this.restoreBackup(backupFolders, backupDir, projectData.projectDir);
			this.spinner.fail();
			this.$errors.fail(
				`${MigrateController.migrateFailMessage} The error is: ${error}`
			);
		}

		this.spinner.stop();
		this.spinner.info(MigrateController.MIGRATE_FINISH_MESSAGE);
	}

	public async shouldMigrate({
		projectDir,
		platforms,
		allowInvalidVersions = false,
	}: IMigrationData): Promise<boolean> {
		const remainingPlatforms = [];
		let shouldMigrate = false;

		for (const platform of platforms) {
			const cachedResult = await this.getCachedShouldMigrate(
				projectDir,
				platform
			);
			if (cachedResult !== false) {
				remainingPlatforms.push(platform);
			} else {
				this.$logger.trace(
					`Got cached result for shouldMigrate for platform: ${platform}`
				);
			}
		}

		if (remainingPlatforms.length > 0) {
			shouldMigrate = await this._shouldMigrate({
				projectDir,
				platforms: remainingPlatforms,
				allowInvalidVersions,
			});
			this.$logger.trace(
				`Executed shouldMigrate for platforms: ${remainingPlatforms}. Result is: ${shouldMigrate}`
			);

			if (!shouldMigrate) {
				for (const remainingPlatform of remainingPlatforms) {
					await this.setCachedShouldMigrate(projectDir, remainingPlatform);
				}
			}
		}

		return shouldMigrate;
	}

	private async _shouldMigrate({
		projectDir,
		platforms,
		allowInvalidVersions,
	}: IMigrationData): Promise<boolean> {
		const isMigrate = _.get(this.$options, "argv._[0]") === "migrate";
		const projectData = this.$projectDataService.getProjectData(projectDir);
		const projectInfo = this.$projectConfigService.detectProjectConfigs(
			projectData.projectDir
		);
		if (!isMigrate && projectInfo.hasNSConfig) {
			return;
		}

		const shouldMigrateCommonMessage =
			"The app is not compatible with this CLI version and it should be migrated. Reason: ";

		for (let i = 0; i < this.migrationDependencies.length; i++) {
			const dependency = this.migrationDependencies[i];
			const hasDependency = this.hasDependency(dependency, projectData);

			if (
				hasDependency &&
				dependency.shouldMigrateAction &&
				(await dependency.shouldMigrateAction(
					projectData,
					allowInvalidVersions
				))
			) {
				this.$logger.trace(
					`${shouldMigrateCommonMessage}'${dependency.packageName}' requires an update.`
				);
				return true;
			}

			if (
				hasDependency &&
				(dependency.replaceWith || dependency.shouldRemove)
			) {
				this.$logger.trace(
					`${shouldMigrateCommonMessage}'${dependency.packageName}' is deprecated.`
				);
				return true;
			}

			if (
				hasDependency &&
				(await this.shouldMigrateDependencyVersion(
					dependency,
					projectData,
					allowInvalidVersions
				))
			) {
				this.$logger.trace(
					`${shouldMigrateCommonMessage}'${dependency.packageName}' should be updated.`
				);
				return true;
			}

			if (!hasDependency && dependency.shouldAddIfMissing) {
				this.$logger.trace(
					`${shouldMigrateCommonMessage}'${dependency.packageName}' is missing.`
				);
				return true;
			}
		}

		for (let platform of platforms) {
			platform = platform && platform.toLowerCase();
			if (
				!this.$platformValidationService.isValidPlatform(platform, projectData)
			) {
				continue;
			}

			const hasRuntimeDependency = this.hasRuntimeDependency({
				platform,
				projectData,
			});
			if (
				hasRuntimeDependency &&
				(await this.shouldUpdateRuntimeVersion(
					this.verifiedPlatformVersions[platform.toLowerCase()],
					platform,
					projectData,
					allowInvalidVersions
				))
			) {
				this.$logger.trace(
					`${shouldMigrateCommonMessage}Platform '${platform}' should be updated.`
				);
				return true;
			}
		}
	}

	public async validate({
		projectDir,
		platforms,
		allowInvalidVersions = true,
	}: IMigrationData): Promise<void> {
		const shouldMigrate = await this.shouldMigrate({
			projectDir,
			platforms,
			allowInvalidVersions,
		});
		if (shouldMigrate) {
			this.$errors.fail(MigrateController.UNABLE_TO_MIGRATE_APP_ERROR);
		}
	}

	private async getCachedShouldMigrate(
		projectDir: string,
		platform: string
	): Promise<boolean> {
		let cachedShouldMigrateValue = null;

		const cachedHash = await this.$jsonFileSettingsService.getSettingValue(
			getHash(`${projectDir}${platform.toLowerCase()}`)
		);
		const packageJsonHash = await this.getPachageJsonHash(projectDir);
		if (cachedHash === packageJsonHash) {
			cachedShouldMigrateValue = false;
		}

		return cachedShouldMigrateValue;
	}

	private async setCachedShouldMigrate(
		projectDir: string,
		platform: string
	): Promise<void> {
		const packageJsonHash = await this.getPachageJsonHash(projectDir);
		await this.$jsonFileSettingsService.saveSetting(
			getHash(`${projectDir}${platform.toLowerCase()}`),
			packageJsonHash
		);
	}

	private async getPachageJsonHash(projectDir: string) {
		const projectPackageJsonFilePath = path.join(
			projectDir,
			constants.PACKAGE_JSON_FILE_NAME
		);
		return await this.$fs.getFileShasum(projectPackageJsonFilePath);
	}

	// private async migrateOldAndroidAppResources(
	// 	projectData: IProjectData,
	// 	backupDir: string
	// ) {
	// 	const appResourcesPath = projectData.getAppResourcesDirectoryPath();
	// 	if (!this.$androidResourcesMigrationService.hasMigrated(appResourcesPath)) {
	// 		this.spinner.info("Migrate old Android App_Resources structure.");
	// 		try {
	// 			await this.$androidResourcesMigrationService.migrate(
	// 				appResourcesPath,
	// 				backupDir
	// 			);
	// 		} catch (error) {
	// 			this.$logger.warn(
	// 				"Migrate old Android App_Resources structure failed: ",
	// 				error.message
	// 			);
	// 		}
	// 	}
	// }

	private async cleanUpProject(projectData: IProjectData): Promise<void> {
		this.spinner.start("Clean old project artifacts.");
		this.$fs.deleteDirectory(
			path.join(projectData.projectDir, constants.HOOKS_DIR_NAME)
		);
		this.$fs.deleteDirectory(
			path.join(projectData.projectDir, constants.PLATFORMS_DIR_NAME)
		);
		this.$fs.deleteDirectory(
			path.join(projectData.projectDir, constants.NODE_MODULES_FOLDER_NAME)
		);
		this.$fs.deleteFile(
			path.join(projectData.projectDir, constants.WEBPACK_CONFIG_NAME)
		);
		this.$fs.deleteFile(
			path.join(projectData.projectDir, constants.PACKAGE_LOCK_JSON_FILE_NAME)
		);
		if (!projectData.isShared) {
			this.$fs.deleteFile(
				path.join(projectData.projectDir, constants.TSCCONFIG_TNS_JSON_NAME)
			);
		}

		this.spinner.text = "Clean old project artifacts complete.";
		this.spinner.succeed();
	}

	private handleAutoGeneratedFiles(
		backupDir: string,
		projectData: IProjectData
	): void {
		const globOptions: glob.IOptions = {
			silent: true,
			nocase: true,
			matchBase: true,
			nodir: true,
			absolute: false,
			cwd: projectData.appDirectoryPath,
		};

		const jsFiles = glob.sync("*.@(js|ts|js.map)", globOptions);
		const autoGeneratedJsFiles = this.getGeneratedFiles(
			jsFiles,
			[".js"],
			[".ts"]
		);
		const autoGeneratedJsMapFiles = this.getGeneratedFiles(
			jsFiles,
			[".map"],
			[""]
		);
		const cssFiles = glob.sync("*.@(le|sa|sc|c)ss", globOptions);
		const autoGeneratedCssFiles = this.getGeneratedFiles(
			cssFiles,
			[".css"],
			[".scss", ".sass", ".less"]
		);

		const allGeneratedFiles = autoGeneratedJsFiles
			.concat(autoGeneratedJsMapFiles)
			.concat(autoGeneratedCssFiles);
		for (const generatedFile of allGeneratedFiles) {
			const sourceFile = path.join(projectData.appDirectoryPath, generatedFile);
			const destinationFile = path.join(backupDir, generatedFile);
			const destinationFileDir = path.dirname(destinationFile);
			this.$fs.ensureDirectoryExists(destinationFileDir);
			this.$fs.rename(sourceFile, destinationFile);
		}
	}

	private getGeneratedFiles(
		allFiles: string[],
		generatedFileExts: string[],
		sourceFileExts: string[]
	): string[] {
		const autoGeneratedFiles = allFiles.filter((file) => {
			let isGenerated = false;
			const { dir, name, ext } = path.parse(file);
			if (generatedFileExts.indexOf(ext) > -1) {
				for (const sourceExt of sourceFileExts) {
					const possibleSourceFile = path.format({ dir, name, ext: sourceExt });
					isGenerated = allFiles.indexOf(possibleSourceFile) > -1;
					if (isGenerated) {
						break;
					}
				}
			}

			return isGenerated;
		});

		return autoGeneratedFiles;
	}

	private async migrateDependencies(
		projectData: IProjectData,
		platforms: string[],
		allowInvalidVersions: boolean
	): Promise<void> {
		this.spinner.start("Start dependencies migration.");
		for (let i = 0; i < this.migrationDependencies.length; i++) {
			const dependency = this.migrationDependencies[i];
			const hasDependency = this.hasDependency(dependency, projectData);

			if (
				hasDependency &&
				dependency.migrateAction &&
				(await dependency.shouldMigrateAction(
					projectData,
					allowInvalidVersions
				))
			) {
				const newDependencies = await dependency.migrateAction(
					projectData,
					path.join(projectData.projectDir, MigrateController.backupFolder)
				);
				for (const newDependency of newDependencies) {
					await this.migrateDependency(
						newDependency,
						projectData,
						allowInvalidVersions
					);
				}
			}
			this.spinner.start(`Migrating ${dependency.packageName}...`);
			await this.migrateDependency(
				dependency,
				projectData,
				allowInvalidVersions
			);
			this.spinner.succeed();
		}

		for (const platform of platforms) {
			const lowercasePlatform = platform.toLowerCase();
			const hasRuntimeDependency = this.hasRuntimeDependency({
				platform,
				projectData,
			});
			if (
				hasRuntimeDependency &&
				(await this.shouldUpdateRuntimeVersion(
					this.verifiedPlatformVersions[lowercasePlatform],
					platform,
					projectData,
					allowInvalidVersions
				))
			) {
				const verifiedPlatformVersion = this.verifiedPlatformVersions[
					lowercasePlatform
				];
				const platformData = this.$platformsDataService.getPlatformData(
					lowercasePlatform,
					projectData
				);
				this.spinner.info(
					`Updating ${platform} platform to version '${verifiedPlatformVersion}'.`
				);
				await this.$addPlatformService.setPlatformVersion(
					platformData,
					projectData,
					verifiedPlatformVersion
				);
				this.spinner.succeed();
			}
		}

		this.spinner.info("Installing packages.");
		await this.$packageManager.install(
			projectData.projectDir,
			projectData.projectDir,
			{
				disableNpmInstall: false,
				frameworkPath: null,
				ignoreScripts: false,
				path: projectData.projectDir,
			}
		);
		this.spinner.text = "Installing packages... Complete";
		this.spinner.succeed();

		this.spinner.succeed("Migration complete.");
	}

	private async migrateDependency(
		dependency: IMigrationDependency,
		projectData: IProjectData,
		allowInvalidVersions: boolean
	): Promise<void> {
		const hasDependency = this.hasDependency(dependency, projectData);
		if (hasDependency && dependency.warning) {
			this.$logger.warn(dependency.warning);
		}

		if (hasDependency && (dependency.replaceWith || dependency.shouldRemove)) {
			this.$pluginsService.removeFromPackageJson(
				dependency.packageName,
				projectData.projectDir
			);
			if (dependency.replaceWith) {
				const replacementDep = _.find(
					this.migrationDependencies,
					(migrationPackage) =>
						migrationPackage.packageName === dependency.replaceWith
				);
				if (!replacementDep) {
					this.$errors.fail("Failed to find replacement dependency.");
				}

				this.spinner.info(
					`Replacing '${dependency.packageName}' with '${replacementDep.packageName}'.`
				);
				this.$pluginsService.addToPackageJson(
					replacementDep.packageName,
					replacementDep.verifiedVersion,
					replacementDep.isDev,
					projectData.projectDir
				);
			}

			return;
		}

		if (
			hasDependency &&
			(await this.shouldMigrateDependencyVersion(
				dependency,
				projectData,
				allowInvalidVersions
			))
		) {
			this.spinner.info(
				`Updating '${dependency.packageName}' to compatible version '${dependency.verifiedVersion}'`
			);
			this.$pluginsService.addToPackageJson(
				dependency.packageName,
				dependency.verifiedVersion,
				dependency.isDev,
				projectData.projectDir
			);
			return;
		}

		if (!hasDependency && dependency.shouldAddIfMissing) {
			this.spinner.info(
				`Adding '${dependency.packageName}' with version '${dependency.verifiedVersion}'`
			);
			this.$pluginsService.addToPackageJson(
				dependency.packageName,
				dependency.verifiedVersion,
				dependency.isDev,
				projectData.projectDir
			);
		}
	}

	private async shouldMigrateDependencyVersion(
		dependency: IMigrationDependency,
		projectData: IProjectData,
		allowInvalidVersions: boolean
	): Promise<boolean> {
		const installedVersion = await this.$packageInstallationManager.getInstalledDependencyVersion(
			dependency.packageName,
			projectData.projectDir
		);
		const requiredVersion = dependency.verifiedVersion;

		return this.isOutdatedVersion(
			installedVersion,
			requiredVersion,
			allowInvalidVersions
		);
	}

	private async shouldUpdateRuntimeVersion(
		targetVersion: string,
		platform: string,
		projectData: IProjectData,
		allowInvalidVersions: boolean
	): Promise<boolean> {
		const installedVersion = await this.getMaxRuntimeVersion({
			platform,
			projectData,
		});

		return this.isOutdatedVersion(
			installedVersion,
			targetVersion,
			allowInvalidVersions
		);
	}

	private isOutdatedVersion(
		version: string,
		targetVersion: string,
		allowInvalidVersions: boolean
	): boolean {
		return !!version
			? semver.lt(version, targetVersion)
			: !allowInvalidVersions;
	}

	private async migrateConfig(projectData: IProjectData) {
		this.spinner.start(
			`Migrating project to use ${constants.CONFIG_FILE_NAME_TS}...`
		);

		this.$projectConfigService.setForceUsingNSConfig(true);

		// app/package.json or src/package.json usually
		const embeddedPackageJsonPath = path.resolve(
			projectData.projectDir,
			projectData.getAppDirectoryRelativePath(),
			constants.PACKAGE_JSON_FILE_NAME
		);
		this.$logger.debug(`embeddedPackageJsonPath: ${embeddedPackageJsonPath}`);
		// nsconfig.json
		const legacyNsConfigPath = path.resolve(
			projectData.projectDir,
			constants.CONFIG_NS_FILE_NAME
		);
		this.$logger.debug(`legacyNsConfigPath: ${legacyNsConfigPath}`);
		// package.json
		const rootPackageJsonPath: any = path.resolve(
			projectData.projectDir,
			constants.PACKAGE_JSON_FILE_NAME
		);
		this.$logger.debug(`rootPackageJsonPath: ${rootPackageJsonPath}`);

		let embeddedPackageData: any = {};
		if (this.$fs.exists(embeddedPackageJsonPath)) {
			embeddedPackageData = this.$fs.readJson(embeddedPackageJsonPath);
		}

		let legacyNsConfigData: any = {};
		if (this.$fs.exists(legacyNsConfigPath)) {
			legacyNsConfigData = this.$fs.readJson(legacyNsConfigPath);
		}

		let rootPackageJsonData: any = {};
		if (this.$fs.exists(rootPackageJsonPath)) {
			rootPackageJsonData = this.$fs.readJson(rootPackageJsonPath);
		}

		const dataToMigrate: any = {
			...embeddedPackageData,
			...legacyNsConfigData,
		};

		// move main key into root packagejson
		if (dataToMigrate.main) {
			rootPackageJsonData.main = dataToMigrate.main;
			delete dataToMigrate.main;
		}

		// migrate data into nativescript.config.ts
		const success = await this.$projectConfigService.setValue(
			"",
			dataToMigrate
		);

		if (!success) {
			this.$errors.fail(
				`Failed to migrate project to use ${constants.CONFIG_FILE_NAME_TS}. One or more values could not be updated.`
			);
		}

		// move app id into nativescript.config.ts
		if (
			rootPackageJsonData &&
			rootPackageJsonData.nativescript &&
			rootPackageJsonData.nativescript.id
		) {
			await this.$projectConfigService.setValue(
				"id",
				rootPackageJsonData.nativescript.id
			);
			delete rootPackageJsonData.nativescript;
		}

		// detect path to src and App_Resources
		const possibleAppPaths = [
			path.resolve(projectData.projectDir, constants.SRC_DIR),
			path.resolve(projectData.projectDir, constants.APP_FOLDER_NAME),
		];

		const appPath = possibleAppPaths.find((possiblePath) =>
			this.$fs.exists(possiblePath)
		);
		if (appPath) {
			const relativeAppPath = path
				.relative(projectData.projectDir, appPath)
				.replace(path.sep, "/");
			this.$logger.trace(
				`Found app source at '${appPath}'. Writing '${relativeAppPath}' to config.`
			);
			const ok = await this.$projectConfigService.setValue(
				"appPath",
				relativeAppPath.toString()
			);
			this.$logger.trace(ok ? `Ok...` : "Could not write...");
		}

		const possibleAppResourcesPaths = [
			path.resolve(
				projectData.projectDir,
				appPath,
				constants.APP_RESOURCES_FOLDER_NAME
			),
			path.resolve(projectData.projectDir, constants.APP_RESOURCES_FOLDER_NAME),
		];

		const appResourcesPath = possibleAppResourcesPaths.find((possiblePath) =>
			this.$fs.exists(possiblePath)
		);
		if (appResourcesPath) {
			const relativeAppResourcesPath = path
				.relative(projectData.projectDir, appResourcesPath)
				.replace(path.sep, "/");
			this.$logger.trace(
				`Found App_Resources at '${appResourcesPath}'. Writing '${relativeAppResourcesPath}' to config.`
			);
			const ok = await this.$projectConfigService.setValue(
				"appResourcesPath",
				relativeAppResourcesPath.toString()
			);
			this.$logger.trace(ok ? `Ok...` : "Could not write...");
		}

		// save root package.json
		this.$fs.writeJson(rootPackageJsonPath, rootPackageJsonData);

		// delete migrated files
		this.$fs.deleteFile(embeddedPackageJsonPath);
		this.$fs.deleteFile(legacyNsConfigPath);

		this.spinner.text = `Migrated project to use ${constants.CONFIG_FILE_NAME_TS}`;
		this.spinner.succeed();
	}

	private async migrateUnitTestRunner(
		projectData: IProjectData,
		migrationBackupDirPath: string
	): Promise<IMigrationDependency[]> {
		// Migrate karma.conf.js
		const pathToKarmaConfig = path.join(
			migrationBackupDirPath,
			constants.KARMA_CONFIG_NAME
		);
		if (this.$fs.exists(pathToKarmaConfig)) {
			const oldKarmaContent = this.$fs.readText(pathToKarmaConfig);

			const regExp = /frameworks:\s+\[([\S\s]*?)\]/g;
			const matches = regExp.exec(oldKarmaContent);
			const frameworks =
				(matches && matches[1] && matches[1].trim()) || '["jasmine"]';

			const testsDir = path.join(projectData.appDirectoryPath, "tests");
			const relativeTestsDir = path.relative(projectData.projectDir, testsDir);
			const testFiles = `'${fromWindowsRelativePathToUnix(
				relativeTestsDir
			)}/**/*.*'`;

			const karmaConfTemplate = this.$resources.readText("test/karma.conf.js");
			const karmaConf = _.template(karmaConfTemplate)({
				frameworks,
				testFiles,
			});
			this.$fs.writeFile(
				path.join(projectData.projectDir, constants.KARMA_CONFIG_NAME),
				karmaConf
			);
		}

		// Dependencies to migrate
		const dependencies = [
			{
				packageName: "karma-webpack",
				verifiedVersion: "3.0.5",
				isDev: true,
				shouldAddIfMissing: true,
			},
			{ packageName: "karma-jasmine", verifiedVersion: "2.0.1", isDev: true },
			{ packageName: "karma-mocha", verifiedVersion: "1.3.0", isDev: true },
			{ packageName: "karma-chai", verifiedVersion: "0.1.0", isDev: true },
			{ packageName: "karma-qunit", verifiedVersion: "3.1.2", isDev: true },
			{ packageName: "karma", verifiedVersion: "4.1.0", isDev: true },
		];

		return dependencies;
	}

	private async migrateNativeScriptAngular(): Promise<IMigrationDependency[]> {
		const dependencies = [
			{
				packageName: "@angular/platform-browser-dynamic",
				verifiedVersion: "10.0.0",
				shouldAddIfMissing: true,
			},
			{
				packageName: "@angular/common",
				verifiedVersion: "10.0.0",
				shouldAddIfMissing: true,
			},
			{
				packageName: "@angular/compiler",
				verifiedVersion: "10.0.0",
				shouldAddIfMissing: true,
			},
			{
				packageName: "@angular/core",
				verifiedVersion: "10.0.0",
				shouldAddIfMissing: true,
			},
			{
				packageName: "@angular/forms",
				verifiedVersion: "10.0.0",
				shouldAddIfMissing: true,
			},
			{
				packageName: "@angular/platform-browser",
				verifiedVersion: "10.0.0",
				shouldAddIfMissing: true,
			},
			{
				packageName: "@angular/router",
				verifiedVersion: "10.0.0",
				shouldAddIfMissing: true,
			},
			{
				packageName: "rxjs",
				verifiedVersion: "6.6.0",
				shouldAddIfMissing: true,
			},
			{
				packageName: "zone.js",
				verifiedVersion: "0.11.1",
				shouldAddIfMissing: true,
			},
			{
				packageName: "@angular/animations",
				verifiedVersion: "10.0.0",
				shouldAddIfMissing: true,
			},
			{
				packageName: "@angular/compiler-cli",
				verifiedVersion: "10.0.0",
				isDev: true,
			},
			{
				packageName: "@ngtools/webpack",
				verifiedVersion: "10.0.0",
				isDev: true,
			},
			{
				packageName: "@angular-devkit/build-angular",
				verifiedVersion: "0.1000.8",
				isDev: true,
			},
		];

		return dependencies;
	}

	private async migrateNativeScriptVue(): Promise<IMigrationDependency[]> {
		const dependencies = [
			{
				packageName: "nativescript-vue-template-compiler",
				verifiedVersion: "2.8.0",
				isDev: true,
			},
		];

		return dependencies;
	}
}

injector.register("migrateController", MigrateController);
